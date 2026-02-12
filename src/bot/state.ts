import { type ChatState, createDefaultState } from "../types/state";

const states = new Map<number, ChatState>();

export function getState(chatId: number): ChatState {
  let state = states.get(chatId);
  if (!state) {
    state = createDefaultState();
    states.set(chatId, state);
  }
  return state;
}

export function resetState(chatId: number): void {
  states.set(chatId, createDefaultState());
}
