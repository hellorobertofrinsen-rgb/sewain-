import React from "react";
import { View } from "react-native";
import { Button, Chip, Field, Input } from "./ui";
import { spacing } from "@/src/theme";

export const PROP_TYPES = ["apartment", "kos", "villa", "kontrakan", "coliving"];
export const TYPE_LABEL: Record<string, string> = {
  apartment: "Apartemen",
  kos: "Kos",
  villa: "Villa",
  kontrakan: "Kontrakan",
  coliving: "Coliving",
  lainnya: "Lainnya",
};

export type PropertyFormValue = { name: string; type: string; city: string; area: string };
export const emptyProperty: PropertyFormValue = { name: "", type: "apartment", city: "", area: "" };

export function PropertyForm({ f, setF, onSave, saving }: { f: PropertyFormValue; setF: (v: PropertyFormValue) => void; onSave: () => void; saving: boolean }) {
  return (
    <View style={{ gap: spacing.md }}>
      <Field label="Nama properti">
        <Input testID="property-name-input" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="mis. Tokyo Riverside Apartment" />
      </Field>
      <Field label="Tipe">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PROP_TYPES.map((t) => (
            <Chip key={t} label={TYPE_LABEL[t]} active={f.type === t} onPress={() => setF({ ...f, type: t })} testID={`property-type-${t}`} />
          ))}
        </View>
      </Field>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Kota">
            <Input testID="property-city-input" value={f.city} onChangeText={(v) => setF({ ...f, city: v })} placeholder="Jakarta Utara" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Area">
            <Input testID="property-area-input" value={f.area} onChangeText={(v) => setF({ ...f, area: v })} placeholder="PIK 2" />
          </Field>
        </View>
      </View>
      <Button title="Simpan Properti" onPress={onSave} loading={saving} disabled={!f.name.trim()} testID="property-save-button" />
    </View>
  );
}

