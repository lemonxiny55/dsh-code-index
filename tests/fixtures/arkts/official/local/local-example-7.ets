  @ComponentV2
  struct ChildComponent {
    @Local message: string = 'Hello World';
    build() {
    }
  }
  @ComponentV2
  struct MyComponent {
    build() {
      ChildComponent({ message: 'Hello' }) // Incorrect usage. An error is reported at compile time.
    }
  }
  