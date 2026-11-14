// Dữ liệu nội dung chi tiết phục vụ tính năng xem trước (Preview) và kiểm tra đồng bộ Google Drive
// Dành cho BỆNH VIỆN ĐA KHOA SÔNG THƯƠNG - KHOA CẬN LÂM SÀNG

export interface SpreadsheetRow {
  rowNum: number;
  sampleCode: string;
  testName: string;
  unit: string;
  referenceRange: string;
  measuredValue: number | string;
  targetValue: number | string;
  zScore: number | string;
  status: 'ĐẠT' | 'CẢNH BÁO' | 'VI PHẠM';
  technician: string;
}

export interface SpreadsheetTab {
  id: string;
  name: string;
  rows: SpreadsheetRow[];
}

export const SAMPLE_EQA_SPREADSHEET: SpreadsheetTab[] = [
  {
    id: 'tab-eqa-q2',
    name: '📊 Ngoại kiểm EQA Q2-2026',
    rows: [
      { rowNum: 1, sampleCode: 'EQA-26-GLU', testName: 'Glucose máu mao mạch / huyết tương', unit: 'mmol/L', referenceRange: '3.9 - 6.4', measuredValue: 5.42, targetValue: 5.40, zScore: '+0.04', status: 'ĐẠT', technician: 'KTV. Vũ Văn Hải' },
      { rowNum: 2, sampleCode: 'EQA-26-URE', testName: 'Ure huyết thanh', unit: 'mmol/L', referenceRange: '2.5 - 7.5', measuredValue: 5.10, targetValue: 5.08, zScore: '+0.03', status: 'ĐẠT', technician: 'KTV. Vũ Văn Hải' },
      { rowNum: 3, sampleCode: 'EQA-26-CRE', testName: 'Creatinine máu (Jaffé bù)', unit: 'µmol/L', referenceRange: '62 - 106', measuredValue: 84.5, targetValue: 85.0, zScore: '-0.08', status: 'ĐẠT', technician: 'KTV. Vũ Văn Hải' },
      { rowNum: 4, sampleCode: 'EQA-26-AST', testName: 'AST (GOT) enzym gan', unit: 'U/L', referenceRange: '< 35', measuredValue: 24.8, targetValue: 24.5, zScore: '+0.12', status: 'ĐẠT', technician: 'KTV. Trần Thị Mai' },
      { rowNum: 5, sampleCode: 'EQA-26-ALT', testName: 'ALT (GPT) enzym gan', unit: 'U/L', referenceRange: '< 35', measuredValue: 26.2, targetValue: 26.0, zScore: '+0.07', status: 'ĐẠT', technician: 'KTV. Trần Thị Mai' },
      { rowNum: 6, sampleCode: 'EQA-26-TNI', testName: 'Troponin T hs (Tim mạch)', unit: 'ng/L', referenceRange: '< 14', measuredValue: 8.4, targetValue: 8.5, zScore: '-0.06', status: 'ĐẠT', technician: 'KTV. Lê Hoàng Nam' },
      { rowNum: 7, sampleCode: 'EQA-26-CHO', testName: 'Cholesterol toàn phần', unit: 'mmol/L', referenceRange: '3.9 - 5.2', measuredValue: 4.88, targetValue: 4.85, zScore: '+0.05', status: 'ĐẠT', technician: 'KTV. Vũ Văn Hải' },
      { rowNum: 8, sampleCode: 'EQA-26-TRI', testName: 'Triglyceride huyết thanh', unit: 'mmol/L', referenceRange: '0.46 - 1.88', measuredValue: 1.42, targetValue: 1.40, zScore: '+0.08', status: 'ĐẠT', technician: 'KTV. Vũ Văn Hải' },
      { rowNum: 9, sampleCode: 'EQA-26-HBA', testName: 'HbA1c máu toàn phần (HPLC)', unit: '%', referenceRange: '4.0 - 6.0', measuredValue: 5.62, targetValue: 5.60, zScore: '+0.03', status: 'ĐẠT', technician: 'KTV. Lê Hoàng Nam' },
      { rowNum: 10, sampleCode: 'EQA-26-ELE', testName: 'Điện giải đồ Na+ / K+ / Cl-', unit: 'mmol/L', referenceRange: '135 - 145', measuredValue: 140.2, targetValue: 140.0, zScore: '+0.02', status: 'ĐẠT', technician: 'KTV. Trần Thị Mai' }
    ]
  },
  {
    id: 'tab-westgard',
    name: '📈 Quy tắc Westgard IQC',
    rows: [
      { rowNum: 1, sampleCode: 'IQC-COBAS-01', testName: 'Nội kiểm Cobas 6000 Mức 1 (Normal)', unit: 'Index', referenceRange: 'Mean ± 2SD', measuredValue: 'Trong giới hạn', targetValue: '1-2s (Passed)', zScore: '+0.15', status: 'ĐẠT', technician: 'KTV. Vũ Văn Hải' },
      { rowNum: 2, sampleCode: 'IQC-COBAS-02', testName: 'Nội kiểm Cobas 6000 Mức 2 (Pathology)', unit: 'Index', referenceRange: 'Mean ± 2SD', measuredValue: 'Trong giới hạn', targetValue: '1-2s (Passed)', zScore: '-0.22', status: 'ĐẠT', technician: 'KTV. Vũ Văn Hải' },
      { rowNum: 3, sampleCode: 'IQC-XN-HEM', testName: 'Nội kiểm Máy Huyết học Sysmex XN-1000', unit: 'Index', referenceRange: 'Mean ± 2SD', measuredValue: 'Chuẩn 3 mức L/N/H', targetValue: 'Pass Westgard', zScore: '+0.08', status: 'ĐẠT', technician: 'KTV. Lê Hoàng Nam' },
      { rowNum: 4, sampleCode: 'IQC-COAG', testName: 'Nội kiểm Đông máu Stago Compact Max', unit: 'Sec', referenceRange: 'PT / APTT', measuredValue: 'Chính xác 99.8%', targetValue: 'Pass QC', zScore: '+0.01', status: 'ĐẠT', technician: 'KTV. Trần Thị Mai' }
    ]
  },
  {
    id: 'tab-audit',
    name: '📑 Nhật ký Đồng bộ Google Drive',
    rows: [
      { rowNum: 1, sampleCode: 'SYNC-DRIVE-01', testName: 'Tải lên bảng tính EQA lên thư mục Drive Khoa', unit: 'Tệp XLSX', referenceRange: '3.1 MB', measuredValue: 'Đồng bộ 100%', targetValue: 'SHA-256 OK', zScore: '0 ms', status: 'ĐẠT', technician: 'Hệ thống tự động' },
      { rowNum: 2, sampleCode: 'SYNC-DRIVE-02', testName: 'Tạo bản sao lưu Cloud Backup Google Drive', unit: 'Backup Daily', referenceRange: 'Thư mục ISO', measuredValue: 'Ghi nhận Drive ID', targetValue: '1drive_file_eqa', zScore: '18 ms', status: 'ĐẠT', technician: 'Quản trị viên IT' }
    ]
  }
];

export interface SOPDocumentSection {
  title: string;
  content: string[];
}

export const SAMPLE_SOP_DETAILS: Record<string, {
  hospitalName: string;
  department: string;
  sopCode: string;
  title: string;
  effectiveDate: string;
  revision: string;
  author: string;
  reviewer: string;
  approver: string;
  purpose: string;
  scope: string;
  sections: SOPDocumentSection[];
}> = {
  'SOP-CLS-01': {
    hospitalName: 'BỆNH VIỆN ĐA KHOA SÔNG THƯƠNG',
    department: 'KHOA CẬN LÂM SÀNG - BỘ PHẬN XÉT NGHIỆM',
    sopCode: 'SOP-CLS-01',
    title: 'QUY TRÌNH THAO TÁC CHUẨN: LẤY MẪU XÉT NGHIỆM AN TOÀN & BẢO QUẢN BỆNH PHẨM',
    effectiveDate: '2026-07-20',
    revision: 'Lần ban hành 03 (Soát xét định kỳ)',
    author: 'CN. Lê Thị Hương (Điều dưỡng trưởng)',
    reviewer: 'ThS. BS. Nguyễn Hoài Nam (Phó khoa)',
    approver: 'TS. BS. Phạm Đức Thành (Trưởng khoa)',
    purpose: 'Chuẩn hóa toàn diện kỹ thuật lấy mẫu máu, nước tiểu, dịch cơ thể, đảm bảo an toàn sinh học cấp II, chống nhầm lẫn người bệnh và duy trì độ tin cậy tuyệt đối của mẫu xét nghiệm theo tiêu chuẩn ISO 15189:2022.',
    scope: 'Áp dụng cho toàn bộ Bác sĩ chỉ định, Kỹ thuật viên xét nghiệm, Điều dưỡng trung tâm tiếp đón và lấy mẫu ngoại trú/nội trú tại Bệnh viện Đa khoa Sông Thương.',
    sections: [
      {
        title: '1. Chuẩn bị dụng cụ & Tiếp nhận người bệnh',
        content: [
          'Đối chiếu ít nhất 02 yếu tố định danh người bệnh: Họ tên đầy đủ, ngày tháng năm sinh và Mã hồ sơ bệnh nhân (PID/Barcode) trên phiếu chỉ định HIS.',
          'Kiểm tra tình trạng nhịn ăn hoặc dùng thuốc của người bệnh trước các xét nghiệm đường huyết, mỡ máu, chức năng gan thận.',
          'Chuẩn bị kim lấy máu chân không (Vacutainer), garo cao su vô khuẩn, cồn sát khuẩn 70 độ, bông băng cá nhân và khay chứa chất thải y tế nguy hại.'
        ]
      },
      {
        title: '2. Thứ tự lấy mẫu vào các ống nghiệm (Order of Draw)',
        content: [
          'Thứ tự chuẩn theo khuyến cáo CLSI: 1. Chai cấy máu vô trùng -> 2. Ống nắp xanh lam (Citrat Natri - Đông máu) -> 3. Ống nắp đỏ/vàng (Serum gel - Sinh hóa, Miễn dịch) -> 4. Ống nắp xanh lục (Heparin) -> 5. Ống nắp tím (EDTA - Huyết học) -> 6. Ống nắp xám (Natri Florua - Glucose).',
          'Trộn nhẹ nhàng ống nghiệm bằng cách đảo ngược 5-8 lần ngay sau khi rút máu, tuyệt đối không lắc mạnh tránh gây vỡ hồng cầu (tan máu/Hemolysis).'
        ]
      },
      {
        title: '3. Dán nhãn Barcode & Bàn giao phòng xét nghiệm',
        content: [
          'In và dán mã vạch Barcode dọc theo thân ống nghiệm ngay tại bàn lấy mẫu trước mặt người bệnh, để hở khe kiểm tra thể tích máu.',
          'Cập nhật trạng thái "Đã lấy mẫu" trên hệ thống LIS / WorkHub trong vòng 3 phút.',
          'Vận chuyển mẫu bằng hộp chuyên dụng kín, chống đổ vỡ, duy trì nhiệt độ bảo quản 18 - 25°C đối với mẫu thường quy và 2 - 8°C đối với mẫu đặc biệt.'
        ]
      },
      {
        title: '4. Tiêu chí từ chối mẫu bệnh phẩm không đạt',
        content: [
          'Mẫu bị tan máu nặng (Hemolysis Index > 3), mẫu đông dây trong ống EDTA/Citrat.',
          'Sai tỷ lệ máu / chất chống đông (thể tích máu dưới vạch định mức của ống Citrat).',
          'Ống nghiệm không có nhãn hoặc thông tin trên nhãn không trùng khớp với hệ thống HIS/LIS.'
        ]
      }
    ]
  },
  'GCND-ATBX-2024': {
    hospitalName: 'BỆNH VIỆN ĐA KHOA SÔNG THƯƠNG',
    department: 'KHOA CẬN LÂM SÀNG - BỘ PHẬN CHẨN ĐOÁN HÌNH ẢNH',
    sopCode: 'GCND-ATBX-2024',
    title: 'GIẤY CHỨNG NHẬN AN TOÀN BỨC XẠ & KIỂM ĐỊNH MÁY CHỤP CẮT LỚP VI TÍNH (CT-SCANNER)',
    effectiveDate: '2024-08-01',
    revision: 'Thời hạn 24 tháng (Hiệu lực đến 01/08/2026)',
    author: 'Cục An toàn Bức xạ và Hạt nhân - Bộ Khoa học & Công nghệ',
    reviewer: 'Kỹ sư TBYT Nguyễn Văn Bình',
    approver: 'Cục trưởng Cục ATBXHN cấp phép',
    purpose: 'Chứng nhận phòng máy CT-Scanner 128 dãy và máy X-quang kỹ thuật số của Bệnh viện Đa khoa Sông Thương đạt đầy đủ tiêu chuẩn che chắn bức xạ chì, suất liều môi trường an toàn cho nhân viên y tế và cộng đồng.',
    scope: 'Áp dụng cho Phòng chụp CT-Scanner (Phòng 104 Tầng 1) và nhân viên vận hành thiết bị bức xạ.',
    sections: [
      {
        title: '1. Kết quả đo kiểm suất liều bức xạ phòng máy',
        content: [
          'Suất liều tại vị trí điều khiển sau kính chì bảo vệ: 0.12 µSv/h (Tiêu chuẩn cho phép: < 2.5 µSv/h - Đạt).',
          'Suất liều tại cửa phòng chụp phía hành lang chờ người bệnh: 0.08 µSv/h (Tiêu chuẩn cho phép: < 0.5 µSv/h - Đạt).',
          'Suất liều tại bức tường tiếp giáp phòng liền kề: 0.06 µSv/h (Đạt chuẩn an toàn tuyệt đối).'
        ]
      },
      {
        title: '2. Yêu cầu kiểm soát liều kế cá nhân định kỳ',
        content: [
          '100% Bác sĩ và Kỹ thuật viên vận hành máy phải đeo liều kế cá nhân TLD trong suốt ca trực.',
          'Gửi liều kế đọc kết quả định kỳ 3 tháng/lần tại Viện Nghiên cứu Hạt nhân.',
          'Cảnh báo: Giấy chứng nhận cần hoàn tất thủ tục nộp hồ sơ tái kiểm định trước ngày 01/08/2026.'
        ]
      }
    ]
  },
  'HĐBT-GE-2025': {
    hospitalName: 'BỆNH VIỆN ĐA KHOA SÔNG THƯƠNG',
    department: 'PHÒNG VẬT TƯ TRANG THIẾT BỊ Y TẾ & KHOA CẬN LÂM SÀNG',
    sopCode: 'HĐBT-GE-2025',
    title: 'HỢP ĐỒNG BẢO TRÌ ĐỊNH KỲ & DỊCH VỤ HỖ TRỢ KỸ THUẬT MÁY SIÊU ÂM GE HEALTHCARE',
    effectiveDate: '2025-01-10',
    revision: 'Phụ lục gia hạn 2026',
    author: 'Đại diện GE Healthcare Vietnam & Phòng Kế toán - Vật tư',
    reviewer: 'Trưởng phòng TBYT',
    approver: 'Giám đốc Bệnh viện Đa khoa Sông Thương',
    purpose: 'Đảm bảo hoạt động liên tục 24/7 của hệ thống máy Siêu âm Doppler màu 3D/4D Voluson và Logiq E9, cam kết thời gian đáp ứng sự cố kỹ thuật khẩn cấp dưới 02 giờ.',
    scope: 'Áp dụng cho 04 máy siêu âm tại Khoa Cận Lâm Sàng.',
    sections: [
      {
        title: '1. Nội dung công việc bảo trì định kỳ',
        content: [
          'Vệ sinh đầu dò siêu âm Convex, Linear, Tim mạch và đầu dò qua ngả âm đạo bằng dung dịch chuyên dụng.',
          'Kiểm tra quạt tản nhiệt, bộ lọc bụi, nguồn điện áp ổn định và hiệu chuẩn hình ảnh âm học Acoustic Output.',
          'Cập nhật phần mềm đo đạc sản phụ khoa và tim mạch phiên bản mới nhất.'
        ]
      },
      {
        title: '2. Cam kết phụ tùng & Thời gian khắc phục sự cố',
        content: [
          'Kỹ sư chính hãng có mặt xử lý trong vòng 120 phút kể từ khi tiếp nhận thông báo lỗi.',
          'Cung cấp máy siêu âm dự phòng thay thế miễn phí nếu thời gian sửa chữa vượt quá 24 giờ.'
        ]
      }
    ]
  },
  'SOP-PACS-02': {
    hospitalName: 'BỆNH VIỆN ĐA KHOA SÔNG THƯƠNG',
    department: 'KHOA CẬN LÂM SÀNG - TRUNG TÂM CÔNG NGHỆ THÔNG TIN',
    sopCode: 'SOP-PACS-02',
    title: 'QUY TRÌNH QUẢN LÝ, TRUY XUẤT VÀ LƯU TRỮ HÌNH ẢNH Y KHOA SỐ HÓA PACS / DICOM',
    effectiveDate: '2026-07-22',
    revision: 'Lần ban hành 02',
    author: 'ThS. BS. Nguyễn Hoài Nam (Phó khoa)',
    reviewer: 'Bộ phận CNTT & Quản trị Hệ thống',
    approver: 'Ban Giám đốc Bệnh viện',
    purpose: 'Thiết lập chuẩn truyền nhận dữ liệu hình ảnh DICOM 3.0 giữa các thiết bị CĐHA (MRI, CT, X-quang, Siêu âm) với máy chủ lưu trữ PACS và đồng bộ hóa đám mây Google Drive phục vụ hội chẩn từ xa.',
    scope: 'Áp dụng cho toàn bộ hình ảnh chẩn đoán của bệnh nhân tại Bệnh viện Đa khoa Sông Thương.',
    sections: [
      {
        title: '1. Quy định chuẩn hóa định dạng DICOM',
        content: [
          'Hình ảnh gốc sau khi chụp phải tự động chuyển về máy chủ PACS với đầy đủ DICOM Tags (Patient ID, Accession Number, Modality, Study Date).',
          'Không được phép nén mất dữ liệu (Lossy Compression) đối với ảnh chẩn đoán CT-Scanner và X-quang phổi.',
          'Tự động sao lưu bản snapshot và báo cáo đọc phim dạng PDF lên thư mục Google Drive chuyên dụng của Khoa.'
        ]
      },
      {
        title: '2. Bảo mật và phân quyền truy cập hồ sơ hình ảnh',
        content: [
          'Chỉ Bác sĩ điều trị và nhân viên y tế được phân quyền mới có thể xem và tải hình ảnh bệnh nhân.',
          'Mọi lượt xem hoặc tải hình ảnh đều được ghi lại trong Audit Log hệ thống với IP và định danh tài khoản.'
        ]
      }
    ]
  }
};
