type KeyboardEventLike = {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
  which?: number;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
    which?: number;
  };
};

export function isComposingKeyboardEvent(event: KeyboardEventLike): boolean {
  const nativeEvent = event.nativeEvent ?? event;

  return Boolean(
    event.isComposing ||
      nativeEvent.isComposing ||
      nativeEvent.keyCode === 229 ||
      nativeEvent.which === 229
  );
}

export function isActionEnterKey(event: KeyboardEventLike): boolean {
  return event.key === "Enter" && !isComposingKeyboardEvent(event);
}
