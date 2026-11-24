import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCsvRows, csvTextToObjects } from '../src/utils/csvParser';
import {
  detectMonthInSheetCsv,
  getCandidateTabNames,
  getDaysInMonth,
  getMonthNumber,
  isValidServiceName,
  parseCsvTextToItems,
  parseGoogleSheetRowsToCaseReports,
  resolveSpreadsheetId,
} from '../src/utils/caseReportParser';

describe('RFC-4180 CSV Parser (csvParser.ts)', () => {
  it('strips UTF-8 BOM and parses quoted fields with commas, escaped quotes, and newlines', () => {
    const csv =
      '\uFEFFSTT,Tên dịch vụ,Ghi chú\r\n' +
      '1,"Siêu âm, ổ bụng tổng quát","Có ""LT"" ca ngoài giờ"\r\n' +
      '2,"X-quang ngực\nthẳng",Bình thường\r\n\r\n';

    const rows = parseCsvRows(csv);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], ['STT', 'Tên dịch vụ', 'Ghi chú']);
    assert.deepEqual(rows[1], ['1', 'Siêu âm, ổ bụng tổng quát', 'Có "LT" ca ngoài giờ']);
    assert.deepEqual(rows[2], ['2', 'X-quang ngực\nthẳng', 'Bình thường']);
  });

  it('converts CSV text into normalized header-keyed objects and skips blank rows', () => {
    const csv = 'Họ tên,SĐT,Bộ phận\nBS. Nguyễn Văn A,0912345678,Xét nghiệm\n,,\nKTV. Trần B,0987654321,CĐHA\n';
    const objs = csvTextToObjects(csv);
    assert.equal(objs.length, 2);
    assert.deepEqual(objs[0], { 'Họ tên': 'BS. Nguyễn Văn A', 'SĐT': '0912345678', 'Bộ phận': 'Xét nghiệm' });
    assert.deepEqual(objs[1], { 'Họ tên': 'KTV. Trần B', 'SĐT': '0987654321', 'Bộ phận': 'CĐHA' });
  });
});

describe('Google Sheet Case Report Parser (caseReportParser.ts)', () => {
  it('resolves spreadsheet IDs from full Google Sheets URLs and raw IDs', () => {
    const sheetUrl = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/edit?gid=0#gid=0';
    assert.equal(resolveSpreadsheetId(sheetUrl), '1AbCdEfGhIjKlMnOpQrStUvWxYz123456');
    assert.equal(resolveSpreadsheetId('1AbCdEfGhIjKlMnOpQrStUvWxYz123456'), '1AbCdEfGhIjKlMnOpQrStUvWxYz123456');
    assert.equal(resolveSpreadsheetId('short'), null);
    assert.equal(resolveSpreadsheetId(''), null);
  });

  it('computes month numbers and days in month including leap years', () => {
    assert.equal(getMonthNumber('Tháng 2'), 2);
    assert.equal(getMonthNumber('Tháng 11/2026'), 11);
    assert.equal(getDaysInMonth('Tháng 2', 2024), 29);
    assert.equal(getDaysInMonth('Tháng 2', 2026), 28);
    assert.equal(getDaysInMonth('Tháng 2', 2100), 28);
    assert.equal(getDaysInMonth('Tháng 4', 2026), 30);
    assert.equal(getDaysInMonth('Tháng 12', 2026), 31);
  });

  it('filters out summary, header, and non-service labels cleanly', () => {
    assert.equal(isValidServiceName('Siêu âm ổ bụng'), true);
    assert.equal(isValidServiceName('Clotest H.pylori'), true);
    assert.equal(isValidServiceName(''), false);
    assert.equal(isValidServiceName('12345'), false);
    assert.equal(isValidServiceName('Tổng cộng'), false);
    assert.equal(isValidServiceName('Cộng nhóm'), false);
    assert.equal(isValidServiceName('BH'), false);
    assert.equal(isValidServiceName('ND'), false);
    assert.equal(isValidServiceName('Tháng 11'), false);
  });

  it('generates padded and unpadded candidate tab names and detects month in CSV headers', () => {
    const candidates = getCandidateTabNames('Tháng 2', 2026);
    assert.ok(candidates.includes('Tháng 2'));
    assert.ok(candidates.includes('Tháng 2/2026'));
    assert.ok(candidates.includes('Tháng 02/2026'));
    assert.ok(candidates.includes('T2/2026'));

    assert.equal(detectMonthInSheetCsv('BÁO CÁO SỐ LIỆU THÁNG 11/2026\nNgày 1,Ngày 2'), 11);
    assert.equal(detectMonthInSheetCsv('KHOA CẬN LÂM SÀNG - 02/2026\n'), 2);
    assert.equal(detectMonthInSheetCsv('Bảng tổng hợp T9\n'), 9);
    assert.equal(detectMonthInSheetCsv('Không rõ thời gian\n'), null);
  });

  it('parses dual-column BH/ND layout with multiple categories and LT markers', () => {
    const csv = [
      ['BÁO CÁO SỐ CA THÁNG 11/2026', '', '', '', '', '', ''],
      ['STT', 'Tên dịch vụ', 'Ngày 21', '', 'Ngày 22', '', 'Ngày 23', ''],
      ['', '', 'BH', 'ND', 'BH', 'ND', 'BH', 'ND'],
      ['I', 'NỘI SOI', '', '', '', '', '', ''],
      ['1', '"Nội soi dạ dày, tá tràng"', '10', '2', '14', '1', 'LT', ''],
      ['2', 'Tổng số ca nội soi', '10', '2', '14', '1', '0', '0'],
      ['II', 'XÉT NGHIỆM', '', '', '', '', '', ''],
      ['3', 'Sinh hóa', '200', '350', '214', '360', '', ''],
      ['4', 'Cộng xét nghiệm', '200', '350', '214', '360', '', ''],
    ]
      .map((r) => r.join(','))
      .join('\n');

    const items = parseCsvTextToItems(csv);
    // Note: section header rows like "NỘI SOI" and "XÉT NGHIỆM" themselves pass isValidServiceName
    // unless excluded or kept as category markers — let's verify actual parsed service items!
    const noiSoiDaDay = items.find((i) => i.name === 'Nội soi dạ dày, tá tràng');
    assert.ok(noiSoiDaDay, 'Expected Nội soi dạ dày, tá tràng item');
    assert.equal(noiSoiDaDay.category, 'Nội Soi');
    assert.deepEqual(noiSoiDaDay.dailyData[21], { bh: 10, nd: 2 });
    assert.deepEqual(noiSoiDaDay.dailyData[22], { bh: 14, nd: 1 });
    assert.deepEqual(noiSoiDaDay.dailyData[23], { bh: 'LT', nd: 0 });

    const sinhHoa = items.find((i) => i.name === 'Sinh hóa');
    assert.ok(sinhHoa, 'Expected Sinh hóa item');
    assert.equal(sinhHoa.category, 'Xét nghiệm');
    assert.deepEqual(sinhHoa.dailyData[21], { bh: 200, nd: 350 });
    assert.deepEqual(sinhHoa.dailyData[22], { bh: 214, nd: 360 });

    // Summary rows ("Tổng số...", "Cộng...") must be excluded
    assert.equal(
      items.some((i) => i.name.startsWith('Tổng') || i.name.startsWith('Cộng')),
      false
    );
  });

  it('parses single-column daily totals when consecutive days occupy adjacent columns', () => {
    const rows = [
      ['STT', 'Dịch vụ', '1', '2', '3'],
      ['I', 'X quang', '', '', ''],
      ['1', 'X quang ngực thẳng', '45', '59', '50'],
      ['2', 'Điện tim thường', '30', '35', '28'],
    ];

    const items = parseGoogleSheetRowsToCaseReports(rows);
    const xquang = items.find((i) => i.name === 'X quang ngực thẳng');
    assert.ok(xquang);
    assert.equal(xquang.category, 'X quang');
    assert.deepEqual(xquang.dailyData[1], { bh: 45, nd: 0 });
    assert.deepEqual(xquang.dailyData[2], { bh: 59, nd: 0 });
    assert.deepEqual(xquang.dailyData[3], { bh: 50, nd: 0 });

    const dienTim = items.find((i) => i.name === 'Điện tim thường');
    assert.ok(dienTim);
    assert.equal(dienTim.category, 'Điện tim & LHN');
  });
});
