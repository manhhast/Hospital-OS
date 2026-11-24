import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isBriefingStatsRequest,
  isCompactSummaryRequest,
} from '../server/assistantEngine';

describe('Telegram & Assistant Briefing Command Routing', () => {
  it('routes /tomtat and compact summary queries to isCompactSummaryRequest', () => {
    assert.equal(isCompactSummaryRequest('/tomtat'), true);
    assert.equal(isCompactSummaryRequest('/tomtat@cls_bot 22/11'), true);
    assert.equal(isCompactSummaryRequest('Tóm tắt nhanh tình hình toàn khoa'), true);
    assert.equal(isCompactSummaryRequest('tóm tắt giao ban hôm qua'), true);
    assert.equal(isCompactSummaryRequest('Tóm tắt quy trình ISO 15189'), false);
    assert.equal(isCompactSummaryRequest('/giaoban'), false);
  });

  it('routes /giaoban and detailed briefing requests to isBriefingStatsRequest', () => {
    assert.equal(isBriefingStatsRequest('/giaoban'), true);
    assert.equal(isBriefingStatsRequest('/giaoban@cls_bot hôm qua'), true);
    assert.equal(isBriefingStatsRequest('Báo cáo chi tiết số liệu giao ban ngày 22/11'), true);
    assert.equal(isBriefingStatsRequest('giao ban hôm nay'), true);
    assert.equal(isBriefingStatsRequest('/tomtat'), false);
    assert.equal(isBriefingStatsRequest('Lịch họp giao ban tuần này thế nào?'), false);
  });
});
