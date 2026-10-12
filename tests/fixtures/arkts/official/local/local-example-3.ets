    class RawObject {
      public name: string;
    
      constructor(name: string) {
        this.name = name;
      }
    }
    
    @ObservedV2
    class ObservedObject {
      @Trace public name: string;
    
      constructor(name: string) {
        this.name = name;
      }
    }
    
    @Entry
    @ComponentV2
    struct Index {
      @Local rawObject: RawObject = new RawObject('rawObject');
      @Local observedObject: ObservedObject = new ObservedObject('observedObject');
    
      build() {
        Column() {
          Text(`${this.rawObject.name}`)
          Text(`${this.observedObject.name}`)
          Button('change object')
            .onClick(() => {
              // Changes to the overall assignment of the class object can be observed.
              this.rawObject = new RawObject('new rawObject');
              this.observedObject = new ObservedObject('new observedObject');
            })
          Button('change name')
            .onClick(() => {
              // @Local does not support observation of changes to class member property assignments. Therefore, value changes of rawObject.name cannot be observed.
              this.rawObject.name = 'new rawObject name';
              // The name property of ObservedObject is decorated by @Trace. Therefore, value changes of observedObject.name can be observed.
              this.observedObject.name = 'new observedObject name';
            })
        }
      }
    }
    