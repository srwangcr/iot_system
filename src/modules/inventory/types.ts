export interface HardwareComponent {
  id: string;
  name: string;
  category: string;
  location: string;
  quantity: number;
  available: number;
}

export interface InventoryLocation {
  location: string;
  componentCount: number;
  totalUnits: number;
  availableUnits: number;
  components: HardwareComponent[];
}
