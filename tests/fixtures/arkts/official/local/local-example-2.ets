  @Entry
  @ComponentV2
  struct Index {
    // Number of clicks.
    @Local count: number = 0;
    @Local message: string = 'Hello';
    @Local flag: boolean = false;
  
    build() {
      Column() {
        Text(`${this.count}`)
        Text(`${this.message}`)
        Text(`${this.flag}`)
        Button('change Local')
          .onClick(() => {
            // For variables of primitive types, @Local can observe value changes to variables.
            this.count++;
            this.message += ' World';
            this.flag = !this.flag;
          })
      }
    }
  }
  