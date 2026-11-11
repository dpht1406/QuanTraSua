# Quán Trà Sữa Pastel 3D (Giai đoạn 1)

Game mô phỏng bán trà sữa góc nhìn thứ nhất trên trình duyệt bằng Vite + TypeScript + Three.js, phong cách đồ họa cartoon pastel có viền đen.

## Cách chạy & Build

```bash
npm install
npm run dev      # Chạy server phát triển
npm run check    # Kiểm tra TypeScript và self-check logic (GameState, EventBus, AABB)
npm run build    # Build bản tĩnh ra thư mục dist/
```

## Phím điều khiển (Desktop)

- **Chuột**: Xoay góc nhìn (sau khi bấm **Vào quán**)
- **W / A / S / D**: Di chuyển
- **Shift**: Chạy nhẹ
- **E**: Tương tác với vật thể trong tầm 2m
- **Esc**: Mở khóa chuột / hiện menu tạm dừng

## Cấu trúc thư mục

```text
src/
  core/         # Game loop, quản lý bàn phím, khởi tạo scene/camera/renderer
  world/        # Dựng không gian quán 10x8m và các vật thể từ hình khối cơ bản
  player/       # Điều khiển góc nhìn thứ nhất và giải quyết va chạm AABB
  interaction/  # Raycast tầm 2m từ tâm ngắm và kích hoạt phím E
  state/        # GameState, EventBus (thuần TypeScript, không import Three.js) và self-check
  ui/           # HUD (tiền, ngày, giờ, tâm ngắm, thông báo) và màn hình bắt đầu/tạm dừng
  styles/       # Bảng màu pastel (palette.ts) và hàm tạo viền (outline.ts)
```
