    @Entry
    @ComponentV2
    struct Index {
      @Local numArr: number[] = [1, 2, 3, 4, 5]; // @Local decorated 1D array
      @Local dimensionTwo: number[][] = [[1, 2, 3], [4, 5, 6]]; // @Local decorated 2D array
    
      build() {
        Column() {
          Text(`${this.numArr[0]}`)
          Text(`${this.numArr[1]}`)
          Text(`${this.numArr[2]}`)
          Text(`${this.dimensionTwo[0][0]}`)
          Text(`${this.dimensionTwo[1][1]}`)
          Button('change array item') // Button 1: modifies specific elements in the array.
            .onClick(() => {
              this.numArr[0]++;
              this.numArr[1] += 2;
              this.dimensionTwo[0][0] = 0;
              this.dimensionTwo[1][1] = 0;
            })
          Button('change whole array') // Button 2: replaces the entire array.
            .onClick(() => {
              this.numArr = [5, 4, 3, 2, 1];
              this.dimensionTwo = [[7, 8, 9], [0, 1, 2]];
            })
        }
      }
    }
    