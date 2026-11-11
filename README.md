# Quán Trà Sữa Pastel 3D (Giai đoạn 2)

Game mô phỏng bán trà sữa góc nhìn thứ nhất trên trình duyệt bằng Vite + TypeScript + Three.js, phong cách đồ họa cartoon pastel có viền đen.

## Cách chạy & Build

```bash
npm install
npm run dev      # Chạy server phát triển
npm run check    # Kiểm tra TypeScript và self-check logic (GameState, EventBus, AABB, Menu, Scoring)
npm run build    # Build bản tĩnh ra thư mục dist/
```

## Phím điều khiển (Desktop)

- **Chuột**: Xoay góc nhìn (sau khi bấm **Vào quán**)
- **W / A / S / D**: Di chuyển
- **Shift**: Chạy nhẹ
- **E**: Tương tác với trạm pha chế / vật thể trong tầm 2m
- **1 / 2 / 3**: Chọn loại trà nền, lượng đá, lượng đường hoặc topping khi đứng tại trạm
- **Esc**: Mở khóa chuột / hiện menu tạm dừng

## Cấu trúc thư mục

```text
src/
  core/         # Game loop, quản lý bàn phím (WASD/E/1/2/3), khởi tạo scene/camera/renderer
  world/        # Dựng quán 10x8m, các trạm pha chế và nhân vật khách hàng đi theo waypoint
  player/       # Điều khiển góc nhìn thứ nhất và va chạm AABB
  interaction/  # Raycast tầm 2m từ tâm ngắm và kích hoạt phím E
  state/        # GameState, EventBus, menu, constants, scoring (thuần TypeScript) và self-check
  gameplay/     # Quản lý đơn/khách (orderManager) và nối quy trình pha 7 bước (drinkStations)
  ui/           # HUD, phiếu đơn, bảng chọn 1/2/3, ly đang cầm, màn hình bắt đầu/tạm dừng
  styles/       # Bảng màu pastel (palette.ts) và hàm tạo viền (outline.ts)
```
