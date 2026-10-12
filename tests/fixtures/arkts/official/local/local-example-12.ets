@Entry
@ComponentV2
struct SetSample {
  @Local fruits: Set<string> = new Set(['apple', 'banana']); // @Local decorated variables of the Set type.

  build() {
    Row() {
      Column() {
        ForEach(Array.from(this.fruits.entries()), (item: [number, number]) => {
          Text(`${item[0]}`)
            .fontSize(20)
            .margin(10)
        })
        // New element, triggering UI update
        Button('Add element')
          .onClick(() => {
            this.fruits.add('cherry');
          })
          .width(300)
          .margin(10)
        // Delete an element, triggering UI update.
        Button('Delete element apple')
          .onClick(() => {
            this.fruits.delete('apple');
          })
          .width(300)
          .margin(10)
        // Reassign values to the entire Set, triggering UI update.
        Button('Reset set')
          .onClick(() => {
            this.fruits = new Set(['strawberry', 'blueberry']);
          })
          .width(300)
          .margin(10)
        // Clear the values of the entire Set, triggering UI update.
        Button('Clear set')
          .onClick(() => {
            this.fruits.clear();
          })
          .width(300)
          .margin(10)
      }
      .width('100%')
    }
    .height('100%')
  }
}
