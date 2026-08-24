# Sổ thủy chuẩn

Ứng dụng ghi, tính và bình sai cao độ cho nhiều lượt đo độc lập, dùng chung mã nguồn cho web, iPhone và Android.

## Phiên bản 2.3

- Chuẩn hóa đầu vào BS/FS và cao độ theo mét với 3 chữ số thập phân; Δh, sai số khép và số hiệu chỉnh hiển thị theo milimét nguyên.
- Tự động chuyển sổ schema v2 đang lưu theo mm sang schema v3 dùng đầu vào mét mà không thay đổi kết quả tính toán nội bộ.
- Sửa bộ chọn lượt đo, vùng vuốt xóa và khoảng đệm cuối màn hình Đo cho thanh điều hướng cố định.
- Chuẩn hóa thuật ngữ bình sai lưới độ cao trên giao diện, Excel và báo cáo PDF.
- Bổ sung xuất PDF offline với font Inter nhúng cục bộ và bảng số liệu kỹ thuật đầy đủ.

## Phiên bản 2.1

- Giao diện Apple-inspired mới với vật liệu kính mờ, khoảng thở lớn, typography hệ thống và chuyển động tinh tế.
- Bố cục responsive tối ưu cho web, iPhone và Android; vùng chạm tối thiểu 44 px và hỗ trợ safe area.
- Hệ màu kỹ thuật mới giúp trị đo, cao độ và trạng thái tuyến dễ đọc ngoài hiện trường.
- Toàn bộ công thức tính, schema dữ liệu và quy trình bình sai của phiên bản 2.0 được giữ nguyên.

## Nền tảng tính toán 2.0

- Mỗi sổ có nhiều mốc chuẩn và nhiều lượt đo độc lập; có thể neo cao độ từ mốc nằm ở đầu, giữa hoặc cuối tuyến.
- Hỗ trợ tuyến thuận/ngược, so sánh cùng điểm giữa các lượt và lưu bản sao bằng ID riêng.
- Hai chế độ đo 1 chỉ và 3 chỉ. Chế độ 3 chỉ tự tính khoảng cách mia sau/trước, chênh lệch khoảng cách và sai số chỉ giữa.
- Tự lưu bản nháp, đổi tên sổ/lượt, vuốt trái để xóa trạm và hoàn tác trong 5 giây.
- Dữ liệu v1/v2 được tự động chuyển sang schema v3; trị đọc và cao độ đầu vào dùng mét, lõi tính toán tiếp tục dùng milimét.

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

Dữ liệu sổ lưu cục bộ trên thiết bị. Excel dùng để sao lưu/chuyển sổ giữa các máy; PDF dùng để chia sẻ báo cáo kỹ thuật có định dạng cố định.

Tên mốc và tên điểm được tự động chuẩn hóa thành chữ in hoa trên web, Android và iOS, kể cả dữ liệu mở từ sổ cũ hoặc nhập từ Excel.

File Excel gồm các sheet **Thông tin**, **Mốc chuẩn**, **Tất cả điểm**, **So sánh**, **Bình sai**, **Cao độ bình sai** và một sheet chi tiết cho mỗi lượt đo. Ô số vẫn ở dạng số; cao độ/số đọc dùng mét, Δh/sai số khép/số hiệu chỉnh dùng milimét. Sheet **Tất cả điểm** luôn liệt kê cả các điểm trung gian theo đúng thứ tự đo. Mỗi lần nhập Excel sẽ tạo một sổ mới để không ghi đè dữ liệu hiện có.

## Bình sai cao độ

- Bình sai được thực hiện chung cho toàn bộ các lượt trong sổ bằng mô hình bình sai gián tiếp. Các lượt được liên kết qua tên điểm trùng nhau, nên tuyến đi–về chỉ cần dùng cùng tên DC để nhận một cao độ DC sau bình sai.
- Mốc có cao độ chuẩn được giữ cố định; mọi điểm chưa biết như DC, TP/TV đều tham gia hệ phương trình và xuất hiện trong bảng **Cao độ bình sai**.
- Nếu tất cả đoạn có khoảng cách, trọng số lấy nghịch đảo chiều dài; nếu thiếu khoảng cách, toàn mạng dùng đồng trọng số để tránh trộn hai mô hình trọng số.
- Bậc tự do bằng 0 được cảnh báo là mạng chưa có trị đo thừa: cao độ tính được nhưng chưa đủ điều kiện đánh giá độ tin cậy.
- Nhập khoảng cách từng đoạn theo mét để phân phối sai số khép theo chiều dài.
- Nếu thiếu khoảng cách, ứng dụng tạm phân phối đều theo số trạm máy và hiển thị cảnh báo nghiệp vụ.
- Sai số cho phép tính theo `C × √K`, trong đó `K` là tổng chiều dài tuyến (km) và `C` mặc định là 20 mm/√km.
- Kết quả gồm số hiệu chỉnh chênh cao `(v)`, chênh cao bình sai và cao độ bình sai từng điểm; Excel và PDF dùng chung quy tắc đơn vị.

## Tải APK từ GitHub

Mỗi lần có commit lên nhánh `main`, workflow **Build mobile app** sẽ kiểm thử và tạo APK Android cùng IPA chưa ký. Tên artifact tự mang phiên bản, ví dụ `So-do-thuy-chuan_v2.3.0_Android` và `So-do-thuy-chuan_v2.3.0_unsigned`.
