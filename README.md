# M PlayO

App Windows để xem nhanh video **MP4, MOV, AVI, MKV, WebM**, có xem cả MOV ProRes và AVI.

- Double-click file video trong Windows là mở ngay. Kéo thả file vào cửa sổ cũng được.
- Click phải vào video trong app, hoặc click phải file trong Windows Explorer, để mở trong cửa sổ mới.
- Kéo timeline tự do. Lùi / tiến 1 frame bằng `,` `.` hoặc `←` `→`, giữ `Shift` để nhảy 10 frame.
- Lăn chuột: zoom ngay chỗ con chuột. Kéo chuột: di chuyển khung hình. `0`: vừa khung, `1`: 100%.
- Click lên video: phát / dừng. Double-click: toàn màn hình (video tự zoom vừa khung). Click chuột giữa: zoom vừa khung. Giữ chuột trái + click phải: cửa sổ co vừa khít video.
- Cài đặt → "Đặt làm app mặc định": 1 lần bấm là M PlayO mở mọi định dạng video (dùng [PS-SFTA](https://github.com/DanysysTeam/PS-SFTA), MIT).
- Đánh dấu đoạn: `I` điểm đầu, `O` điểm cuối (hoặc `Shift` + kéo trên timeline), `X` xoá. Bật **Lặp** thì video chỉ phát trong đoạn đó rồi lặp lại.
- Âm lượng: kéo thanh âm lượng, lăn chuột trên nút loa, hoặc phím `+` / `−`.
- Đổi phím tắt trong **Cài đặt**.
- Tự kiểm tra và cài bản cập nhật mới từ GitHub Releases.

## Cài đặt
Vào trang [Releases](https://github.com/satthupc00/PLAYO/releases/latest), tải file `M-PlayO-Setup-x.y.z.exe` rồi chạy.

## Phát hành bản mới (cho dev)
Tăng `version` trong `package.json`, cập nhật `whatsnew.json` rồi gộp vào nhánh `main`. GitHub Actions sẽ tự build và tạo Release `vX.Y.Z` nếu bản đó chưa có.

Created by Mondiro
