import { describe, expect, it } from 'vitest';
import { EMPTY_PANEL_STATE, panelReducer } from './panelState';

describe('vòng đời hộp thoại cài đặt lượt', () => {
  it('mở và đóng cài đặt đúng runId', () => {
    const opened = panelReducer(EMPTY_PANEL_STATE, { type: 'open-settings', runId: 'run-2' });
    expect(opened).toEqual({ settingsRunId: 'run-2', originPickerRunId: null });
    expect(panelReducer(opened, { type: 'close-settings' })).toEqual(EMPTY_PANEL_STATE);
  });

  it('chuyển sang chọn mốc đóng cài đặt trước và không chồng sheet', () => {
    const settings = panelReducer(EMPTY_PANEL_STATE, { type: 'open-settings', runId: 'run-1' });
    const origin = panelReducer(settings, { type: 'open-origin', runId: 'run-1' });
    expect(origin).toEqual({ settingsRunId: null, originPickerRunId: 'run-1' });
  });

  it('đổi sổ, đổi lượt hoặc chuyển tab đặt lại toàn bộ sheet', () => {
    const origin = { settingsRunId: null, originPickerRunId: 'run-3' };
    expect(panelReducer(origin, { type: 'reset' })).toEqual(EMPTY_PANEL_STATE);
  });
});
