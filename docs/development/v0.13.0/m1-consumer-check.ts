// Compile this file from inside the normally installed consumer directory.
import { buildReviewBrief, renderReviewBrief, type ReviewOutput, type ReviewChange,
  type CodeChangeContextArgs, type RepoIndex, type ChangeContextResult } from 'dsh-code-index'

const input: CodeChangeContextArgs = { outputFormat: 'review', budgetChars: 5000, files: ['core.ts'] }
const build: (index: RepoIndex, analysis: ChangeContextResult, budget?: number) => Promise<ReviewOutput> = buildReviewBrief
declare const output: ReviewOutput
if (output.brief.status === 'bounded') {
  const dirty: boolean | null = output.brief.repository.dirty
  const first: ReviewChange | undefined = output.brief.changes[0]
  const omitted: number = output.brief.omitted.tests
  void [dirty, first, omitted]
}
const text: string = renderReviewBrief(output.brief)
// An unresolved re-export degrading to any must not silently pass this check.
type IsAny<T> = 0 extends (1 & T) ? true : false
const concreteOutput: IsAny<ReviewOutput> = false
// @ts-expect-error Candidate tests cannot claim verification succeeded.
const invalidVerification: ReviewOutput['brief']['verification'] = 'passed'
// @ts-expect-error Unknown output formats are not part of the public contract.
const invalidFormat: CodeChangeContextArgs = { outputFormat: 'graph' }
void [input, build, text, concreteOutput, invalidVerification, invalidFormat]
