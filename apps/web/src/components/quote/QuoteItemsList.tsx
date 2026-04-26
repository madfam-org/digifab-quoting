'use client';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface QuoteItem {
  filename: string;
  quantity: number;
  material: string;
  finish?: string;
  process: string;
  unitPrice: number;
  totalPrice: number;
  leadTime: number;
  specifications?: {
    volume?: number;
    boundingBox?: { x: number; y: number; z: number };
    surfaceArea?: number;
  };
}

interface QuoteItemsListProps {
  items: QuoteItem[];
  currency: string;
  onUpdateItem?: (index: number, updates: Partial<QuoteItem>) => void;
  isEditable?: boolean;
}

const MATERIALS_BY_PROCESS: Record<string, { value: string; label: string }[]> = {
  FFF_PLA: [
    { value: 'PLA', label: 'PLA Standard' },
    { value: 'PLA_PLUS', label: 'PLA+' },
    { value: 'PETG', label: 'PETG' },
    { value: 'ABS', label: 'ABS' },
  ],
  SLA_RESIN: [
    { value: 'STANDARD_RESIN', label: 'Standard Resin' },
    { value: 'TOUGH_RESIN', label: 'Tough Resin' },
    { value: 'FLEXIBLE_RESIN', label: 'Flexible Resin' },
  ],
  CNC_ALUMINUM: [
    { value: 'AL6061', label: 'Aluminum 6061' },
    { value: 'AL7075', label: 'Aluminum 7075' },
  ],
  LASER_ACRYLIC: [
    { value: 'ACRYLIC_3MM', label: 'Acrylic 3mm' },
    { value: 'ACRYLIC_5MM', label: 'Acrylic 5mm' },
    { value: 'MDF_3MM', label: 'MDF 3mm' },
  ],
};

export function QuoteItemsList({
  items,
  currency,
  onUpdateItem,
  isEditable = false,
}: QuoteItemsListProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency,
    }).format(price);
  };

  const getProcessName = (process: string) => {
    const processNames: Record<string, string> = {
      FFF_PLA: '3D Printing (FFF)',
      SLA_RESIN: '3D Printing (SLA)',
      CNC_ALUMINUM: 'CNC Machining',
      LASER_ACRYLIC: 'Laser Cutting',
    };
    return processNames[process] || process;
  };

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <Card key={index} className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <h4 className="font-semibold text-sm text-gray-600 mb-1">Part</h4>
              <p className="font-medium">{item.filename}</p>
              <p className="text-sm text-gray-500">{getProcessName(item.process)}</p>
            </div>

            <div>
              <Label htmlFor={`quantity-${index}`} className="text-sm text-gray-600">
                Quantity
              </Label>
              {isEditable ? (
                <Input
                  id={`quantity-${index}`}
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => {
                    const quantity = parseInt(e.target.value) || 1;
                    onUpdateItem?.(index, { quantity });
                  }}
                  className="mt-1"
                />
              ) : (
                <p className="font-medium mt-1">{item.quantity}</p>
              )}
            </div>

            <div>
              <Label htmlFor={`material-${index}`} className="text-sm text-gray-600">
                Material
              </Label>
              {isEditable ? (
                <Select
                  value={item.material}
                  onValueChange={(value) => {
                    onUpdateItem?.(index, { material: value });
                  }}
                >
                  <SelectTrigger id={`material-${index}`} className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIALS_BY_PROCESS[item.process]?.map((material) => (
                      <SelectItem key={material.value} value={material.value}>
                        {material.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium mt-1">{item.material}</p>
              )}
            </div>

            <div>
              <h4 className="font-semibold text-sm text-gray-600 mb-1">Price</h4>
              <p className="font-medium">{formatPrice(item.totalPrice)}</p>
              <p className="text-sm text-gray-500">{formatPrice(item.unitPrice)} each</p>
            </div>
          </div>

          {item.specifications && (
            <div className="mt-4 pt-4 border-t">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Volume:</span>{' '}
                  <span className="font-medium">{item.specifications.volume?.toFixed(2)} cm³</span>
                </div>
                <div>
                  <span className="text-gray-600">Dimensions:</span>{' '}
                  <span className="font-medium">
                    {item.specifications.boundingBox?.x?.toFixed(0)} ×{' '}
                    {item.specifications.boundingBox?.y?.toFixed(0)} ×{' '}
                    {item.specifications.boundingBox?.z?.toFixed(0)} mm
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Lead Time:</span>{' '}
                  <span className="font-medium">{item.leadTime} days</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
