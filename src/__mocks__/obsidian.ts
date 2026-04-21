export const requestUrl = jest.fn();
export class App {}
export class TFile {}
export class TFolder {}
export class Plugin {}
export class PluginSettingTab {}
export class Events {
  trigger = jest.fn();
}
export class Notice {
  constructor(_message: string) {}
}
export class Setting {
  constructor(_el: any) {}
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  addText() {
    return this;
  }
  addToggle() {
    return this;
  }
  addButton() {
    return this;
  }
  addDropdown() {
    return this;
  }
}
export class AbstractInputSuggest<T> {
  constructor(_app: any, _inputEl: any) {}
  getSuggestions(_input: string): T[] {
    return [];
  }
  renderSuggestion(_item: T, _el: any) {}
  selectSuggestion(_item: T) {}
  close() {}
}
