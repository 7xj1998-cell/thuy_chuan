export const EMPTY_PANEL_STATE = Object.freeze({ settingsRunId: null, originPickerRunId: null });

export function panelReducer(state, action) {
  switch (action.type) {
    case 'open-settings':
      return { settingsRunId: action.runId, originPickerRunId: null };
    case 'open-origin':
      return { settingsRunId: null, originPickerRunId: action.runId };
    case 'close-settings':
      return { ...state, settingsRunId: null };
    case 'close-origin':
      return { ...state, originPickerRunId: null };
    case 'reset':
      return { ...EMPTY_PANEL_STATE };
    default:
      return state;
  }
}
