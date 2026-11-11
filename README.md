# Quán Trà Sữa Pastel 3D (Giai đoạn 3)

Game mô phỏng bán trà sữa góc nhìn thứ nhất trên trình duyệt bằng Vite + TypeScript + Three.js, phong cách đồ họa cartoon pastel có viền đen.

## Cách chạy & Build

```bash
npm install
npm run dev      # Chạy server phát triển
npm run check    # Kiểm tra TypeScript và self-check logic (GameState, EventBus, AABB, Menu, Scoring, Inventory, Shift)
npm run build    # Build bản tĩnh ra thư mục dist/
```

## Phím điều khiển (Desktop)

- **Chuột**: Xoay góc nhìn (sau khi bấm **Vào quán**)
- **W / A / S / D**: Di chuyển
- **Shift**: Chạy nhẹ
- **E**: Tương tác với cửa quán (mở/kết ca), máy tính nhập hàng và trạm pha chế (tầm 2m)
- **1 / 2 / 3**: Chọn loại trà nền, lượng đá, lượng đường hoặc topping
- **Y / N**: Xác nhận hoặc hủy kết ca sớm tại cửa
- **Esc**: Đóng bảng nhập hàng hoặc tạm dừng game

## Cấu trúc thư mục

```text
src/
  core/         # Game loop, quản lý bàn phím (WASD/E/1-3/Y/N/Esc), khởi tạo scene
  world/        # Dựng quán 10x8m, trạm pha chế, máy tính nhập hàng và khách hàng waypoint
  player/       # Điều khiển góc nhìn thứ nhất và va chạm AABB
  interaction/  # Raycast tầm 2m từ tâm ngắm và kích hoạt phím E
  state/        # GameState, EventBus, menu, constants, scoring, inventory, shift (thuần TS) + self-check
  gameplay/     # Quản lý ca (shiftManager), đơn/khách (orderManager) và pha chế (drinkStations)
  ui/           # HUD, phiếu đơn, bảng chọn 1/2/3, ly đang cầm, bảng nhập hàng, tổng kết ca
  styles/       # Bảng màu pastel (palette.ts) và hàm tạo viền (outline.ts)
```
