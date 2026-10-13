class ComponentInfo {
  public name: string;
  public count: number;
  public message: string;

  constructor(name: string, count: number, message: string) {
    this.name = name;
    this.count = count;
    this.message = message;
  }
}

@Component
struct Child {
  @State componentInfo: ComponentInfo = new ComponentInfo('Child', 1, 'Hello World'); // componentInfo provided by the parent component will override this initial value.

  build() {
    Column() {
      Text(`componentInfo.message is ${this.componentInfo.message}`)
    }
  }
}

@Entry
@Component
struct Index {
  build() {
    Column() {
      Child({ componentInfo: new ComponentInfo('Unknown', 0, 'Error') })
    }
  }
}
