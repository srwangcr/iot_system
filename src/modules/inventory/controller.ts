import type { Request, Response } from "express";

export interface HardwareComponent {
  id: string;
  name: string;
  category: string;
  quantity: number;
  available: number;
}

const components: HardwareComponent[] = [
  { id: "esp32-devkit", name: "ESP32 DevKit", category: "microcontroller", quantity: 12, available: 8 },
  { id: "raspberry-pi-4", name: "Raspberry Pi 4", category: "single-board-computer", quantity: 4, available: 2 },
  { id: "dht22", name: "DHT22", category: "sensor", quantity: 20, available: 15 },
];

export function listComponents(_request: Request, response: Response): void {
  response.json({ data: components });
}
