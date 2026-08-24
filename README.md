# Sổ thủy chuẩn

Ứng dụng ghi, tính và bình sai cao độ cho nhiều lượt đo độc lập, dùng chung mã nguồn cho web, iPhone và Android.

## Phiên bản 2.0

- Mỗi sổ có nhiều mốc chuẩn và nhiều lượt đo độc lập; có thể neo cao độ từ mốc nằm ở đầu, giữa hoặc cuối tuyến.
- Hỗ trợ tuyến thuận/ngược, so sánh cùng điểm giữa các lượt và lưu bản sao bằng ID riêng.
- Hai chế độ đo 1 chỉ và 3 chỉ. Chế độ 3 chỉ tự tính khoảng cách mia sau/trước, chênh lệch khoảng cách và sai số chỉ giữa.
- Tự lưu bản nháp, đổi tên sổ/lượt, vuốt trái để xóa trạm và hoàn tác trong 5 giây.
- Dữ liệu v1 trong `so-thuy-chuan.books.v1` được tự động chuyển sang schema v2.

## Chạy và kiểm thử

```bash
npm ci
npm test
npm run build
```

## Mobile

```bash
npx cap add android
npx cap add ios
npm run cap:sync
```

- Android: mở thư mục `android` bằng Android Studio, chọn **Build > Generate Signed Bundle / APK**.
- iOS: mở thư mục `ios/App` bằng Xcode trên macOS, chọn signing team rồi Archive.

Dữ liệu sổ lưu cục bộ trên thiết bị. Chức năng Excel dùng để sao lưu hoặc chuyển sổ giữa các máy.

Tên mốc và tên điểm được tự động chuẩn hóa thành chữ in hoa trên web, Android và iOS, kể cả dữ liệu mở từ sổ cũ hoặc nhập từ Excel.

File Excel gồm các sheet **Thông tin**, **Mốc chuẩn**, **Tất cả điểm**, **So sánh**, **Bình sai** và một sheet chi tiết cho mỗi lượt đo. Sheet **Tất cả điểm** luôn liệt kê cả các điểm trung gian theo đúng thứ tự đo. Mỗi lần nhập Excel sẽ tạo một sổ mới để không ghi đè dữ liệu hiện có.

## Bình sai cao độ

- Nhập khoảng cách từng đoạn theo mét để phân phối sai số khép theo chiều dài.
- Nếu thiếu khoảng cách, ứng dụng tạm phân phối đều theo số trạm máy và hiển thị cảnh báo nghiệp vụ.
- Sai số cho phép tính theo `C × √K`, trong đó `K` là tổng chiều dài tuyến (km) và `C` mặc định là 20 mm/√km.
- Kết quả gồm số hiệu chỉnh từng đoạn, chênh cao bình sai và cao độ bình sai từng điểm; Excel có thêm sheet **Bình sai**.

## Tải APK từ GitHub

Mỗi lần có commit lên nhánh `main`, workflow **Build mobile app** sẽ kiểm thử và tạo APK Android cùng IPA chưa ký. Vào **GitHub → Actions → Build mobile app → Artifacts** để tải `So-do-thuy-chuan_v2.0.0_Android` và `So-do-thuy-chuan_v2.0.0_unsigned`.
