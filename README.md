# Sổ thủy chuẩn

Ứng dụng ghi và tính chuyền cao độ DG ↔ DC, dùng chung mã nguồn cho web, iPhone và Android.

## Chạy và kiểm thử

```bash
npm install
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

File Excel gồm các sheet **Thông tin**, **Tất cả điểm**, **Lượt đi** và **Lượt về**. Sheet **Tất cả điểm** liệt kê mốc đầu, toàn bộ TP/TV trung gian và các mốc DG/DC cùng cao độ theo đúng thứ tự đo.

## Tải APK từ GitHub

Mỗi lần có commit lên nhánh `main`, workflow **Build mobile app** sẽ kiểm thử và build APK Android. Vào **GitHub → Actions → Build mobile app → Artifacts** để tải `so-thuy-chuan-android-debug`.
