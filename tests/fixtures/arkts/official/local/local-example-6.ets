  @ComponentV2
  struct MyComponent {
    @Local message: string = 'Hello World'; // Correct usage.
    build() {
    }
  }
  @Component
  struct TestComponent {
    @Local message: string = 'Hello World'; // Incorrect usage. An error is reported at compile time.
    build() {
    }
  }
  