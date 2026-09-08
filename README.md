# Sổ thủy chuẩn

Ứng dụng ghi, tính và bình sai cao độ cho nhiều lượt đo độc lập, dùng chung mã nguồn cho web, iPhone và Android.

## Phiên bản 2.6.0

- QualityCard hiển thị lỗi thật khi lưu trạm bị chặn, tự cuộn tới thông báo và giữ aria-invalid trên ô sai.
- Nhấn Enter/Done ở ô FS cuối tự động lưu trạm; bổ sung rung phản hồi khi lưu thành công hoặc thất bại.
- Tuyến có nút xóa nhanh thay thế cho vuốt trái, tránh phụ thuộc cử chỉ khi đeo găng hoặc tay ướt.
- Thêm Chế độ ngoài trời: tăng cỡ số, tương phản và lưu lựa chọn trên thiết bị.
- Trạm mới kế thừa loại điểm ĐC/TP của trạm liền trước; CSS được gộp về một nguồn và dependency đã ghim version.

## Phiên bản 2.5.2

- Tinh gọn màn hình Đo: bỏ chú thích “Kiểm tra trước khi lưu” và “Nhịp đo nhanh”, giữ giao diện tập trung vào số đọc và nút lưu.

## Phiên bản 2.5.1

- Vô hiệu hóa chọn văn bản và menu **Copy / Look Up / Translate** khi nhấn giữ trên nút, số liệu, thẻ và thanh điều khiển iPhone; các ô nhập vẫn cho phép chọn/sửa bình thường.

## Phiên bản 2.5.0

- Màn hình Đo ưu tiên quy trình **1 chỉ**: nhập BS → FS → lưu; hỗ trợ chuyển nhanh sang 3 chỉ khi cần.
- Thêm bước khởi tạo mốc gốc rõ ràng, tự động nối điểm chuyền và gợi ý tên tia phụ, giảm nhập lặp ngoài hiện trường.
- Kiểm tra trước khi lưu với cảnh báo thiếu số đọc, số âm, trùng điểm và trị đo bất thường; cho phép xác nhận cảnh báo có chủ đích.
- Lưu sổ theo giao dịch, checkpoint và thùng rác; có phục hồi sổ/phiên bản, sao lưu toàn bộ thư viện và nhập JSON/XLSX an toàn.
- Làm mới giao diện mobile-first: vùng chạm lớn, safe-area, bàn phím số, đồ thị tuyến và thanh lưu nhanh cố định.

## Phiên bản 2.4.1

- Loại bỏ hoàn toàn các điểm mẫu `DG3`, `DG4` khỏi sổ mới và nguồn gợi ý Autocomplete.
- Danh sách điểm chỉ được tạo từ mốc chuẩn cùng các điểm trạm đã ghi trong đúng sổ đang mở; sổ chỉ có mốc `A1` sẽ chỉ gợi ý `A1`.
- Làm mới dữ liệu gợi ý khi chuyển sổ, ngăn điểm của sổ trước xuất hiện trong dropdown hiện tại.
- Bổ sung kiểm thử cho sổ trống, sổ một mốc và cách ly dữ liệu giữa nhiều sổ.

## Phiên bản 2.4.0

- Bổ sung hai loại trị đo **Điểm chuyền (ĐC)** và **Tia phụ (TP)** theo đúng quy trình hiện trường: ĐC chuyển điểm gốc, TP giữ nguyên mia sau.
- Tự động gợi ý tên `DC1`, `DC2` và `TP_<điểm gốc>[_Lx].n`; combobox tìm kiếm toàn bộ điểm trong sổ vẫn cho phép nhập tên mới.
- Tia phụ chỉ nhận cao độ suy ra, không tham gia phương trình, trọng số, bậc tự do hoặc số hiệu chỉnh bình sai; Excel/PDF có bảng TP riêng.
- Chuẩn hóa cao độ mốc thông minh và làm tròn đối xứng đến milimét; bổ sung bảo vệ dữ liệu khi ứng dụng bị đưa nền trong lúc nhập.
- Nâng cấp khả năng đọc ngoài hiện trường, vùng chạm, hỗ trợ VoiceOver và hiển thị nổi bật `H tới` trên màn hình Tuyến.

## Phiên bản 2.3.2

- Sửa bố cục vuốt trái để xóa trạm: thẻ nội dung luôn giữ nguyên toàn bộ chiều rộng và chỉ dịch chuyển 80 px trên nút xóa nền.
- Ngăn các trị số kỹ thuật `BS`, `FS` và `Δh` bị co, cắt hoặc biến dạng khi mở thao tác xóa.

## Phiên bản 2.3.1

- Toàn bộ số liệu theo mét trên giao diện và PDF dùng dấu phẩy thập phân Việt Nam: `2,000 m`, `1,585 m`, `0,750 m`.
- Tự sửa số đọc mia cũ nhập theo milimét như `2000.000` thành `2,000` mà không làm đổi lõi tính toán.
- Giao diện bốn màn hình được tinh chỉnh theo hệ Modern Mobile-First: phân cấp rõ, micro-card, vùng chạm 48 px và nút hành động trong vùng ngón cái.
- Mỗi Git tag phiên bản `v*` tự build APK/IPA và tạo GitHub Release có file tải trực tiếp.

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
- Dữ liệu cũ được tự động chuyển sang schema v5; trị đọc và cao độ đầu vào dùng mét, lõi tính toán tiếp tục dùng milimét.

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

File Excel gồm các sheet **Thông tin**, **Mốc chuẩn**, **Tất cả điểm**, **So sánh**, **Bình sai**, **Cao độ bình sai**, sheet **Tia phụ** khi có và một sheet chi tiết cho mỗi lượt đo. Ô số vẫn ở dạng số; cao độ/số đọc dùng mét, Δh/sai số khép/số hiệu chỉnh dùng milimét. Sheet **Tất cả điểm** luôn liệt kê cả các điểm trung gian theo đúng thứ tự đo. Mỗi lần nhập Excel sẽ tạo một sổ mới để không ghi đè dữ liệu hiện có.

## Bình sai cao độ

- Bình sai được thực hiện chung cho toàn bộ các lượt trong sổ bằng mô hình bình sai gián tiếp. Các lượt được liên kết qua tên điểm trùng nhau, nên tuyến đi–về chỉ cần dùng cùng tên DC để nhận một cao độ DC sau bình sai.
- Mốc có cao độ chuẩn được giữ cố định; điểm chuyền tham gia hệ phương trình và xuất hiện trong bảng **Cao độ bình sai**. Tia phụ giữ nguyên điểm gốc, chỉ nhận cao độ suy ra và không tham gia phương trình bình sai.
- Nếu tất cả đoạn có khoảng cách, trọng số lấy nghịch đảo chiều dài; nếu thiếu khoảng cách, toàn mạng dùng đồng trọng số để tránh trộn hai mô hình trọng số.
- Bậc tự do bằng 0 được cảnh báo là mạng chưa có trị đo thừa: cao độ tính được nhưng chưa đủ điều kiện đánh giá độ tin cậy.
- Nhập khoảng cách từng đoạn theo mét để phân phối sai số khép theo chiều dài.
- Nếu thiếu khoảng cách, ứng dụng tạm phân phối đều theo số trạm máy và hiển thị cảnh báo nghiệp vụ.
- Sai số cho phép tính theo `C × √K`, trong đó `K` là tổng chiều dài tuyến (km) và `C` mặc định là 20 mm/√km.
- Kết quả gồm số hiệu chỉnh chênh cao `(v)`, chênh cao bình sai và cao độ bình sai từng điểm; Excel và PDF dùng chung quy tắc đơn vị.

## Tải APK/IPA từ GitHub

Mỗi Git tag trùng phiên bản trong `package.json`, ví dụ `v2.3.1`, sẽ chạy workflow **Build mobile app**, tạo APK Android, IPA chưa ký và tự phát hành GitHub Release. Hai file cài đặt được đính kèm trực tiếp vào Release để tải lâu dài, đồng thời vẫn có artifact lưu 30 ngày trong workflow.
