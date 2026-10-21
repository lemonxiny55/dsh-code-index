/** Trim/crop authentic Desktop footage. No generated UI, overlays or source text. */
import { spawnSync } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
const [input, startArg, durationArg, crop = '-'] = process.argv.slice(2)
const start = Number(startArg), duration = Number(durationArg)
if (!input || !Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 20 || duration > 30 ||
  crop !== '-' && !/^\d+:\d+:\d+:\d+$/.test(crop)) throw Error('Usage: node scripts/process-impact-xray-demo.mjs INPUT START_SECONDS DURATION_20_TO_30 [WIDTH:HEIGHT:X:Y]. Set FFMPEG to an existing ffmpeg binary if needed.')
const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const output = 'assets/impact-xray-mvp'
const filters = [...(crop === '-' ? [] : [`crop=${crop}`]), "scale='min(1180,iw)':-2"]
function run(args) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw Error(r.stderr || String(r.error))
  return r.stderr
}
const log = run(['-ss', String(start), '-i', input, '-t', String(duration), '-vf', filters.join(','), '-an', '-r', '30', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${output}.mp4`])
if (!/frame=\s*[1-9]/.test(log)) throw Error('No footage encoded')
run(['-i', `${output}.mp4`, '-vf', "fps=10,scale='min(1000,iw)':-2,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3", '-loop', '0', `${output}.gif`])
run(['-ss', '8', '-i', `${output}.mp4`, '-frames:v', '1', `${output}-poster.png`])
const sha256 = async p => createHash('sha256').update(await readFile(p)).digest('hex')
const files = []
for (const suffix of ['mp4', 'gif', 'poster.png']) {
  const file = suffix === 'poster.png' ? `${output}-poster.png` : `${output}.${suffix}`
  files.push({ file, bytes: (await stat(file)).size, sha256: await sha256(file) })
}
await writeFile(`${output}-media.json`, JSON.stringify({ method: 'A chronological excerpt of actual DSH Desktop screen recording; rectangular crop/scale, frame-rate conversion, palette quantization and audio removal only. No fabricated UI, text, screenshots or latency claim.', raw: { filename: path.basename(input), sha256: await sha256(input) }, excerpt: { startSeconds: start, durationSeconds: duration, crop, speed: 1 }, files }, null, 2) + '\n')
console.log(JSON.stringify(files, null, 2))
