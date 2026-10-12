@Entry
@ComponentV2
struct Index {
  @Local count: number | undefined = 10; // @Local decorated variable of the union type

  build() {
    Row() {
      Column() {
        Text(`count: ${this.count}`)
        // Change the union variable from number to undefined, triggering the UI update.
        Button('change to undefined')
          .onClick(() => {
            this.count = undefined;
          })
          .width(300)
          .margin(10)
        // Change the union variable from undefined to number, triggering the UI update.
        Button('change to number')
          .onClick(() => {
            this.count = 10;
          })
          .width(300)
          .margin(10)
      }
      .width('100%')
    }
    .height('100%')
  }
}
