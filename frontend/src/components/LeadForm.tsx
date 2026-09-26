import React, { useState } from "react";
import { Pressable, Text as RNText, View } from "react-native";
import { Chip, Field, Input, Textarea } from "./ui";
import { DateInput } from "./DateInput";
import { moneyInput, parseMoney } from "@/src/lib/format";
import { fonts, makeStyles, spacing } from "@/src/theme";

export const UNIT_TYPES = ["Studio", "1 Bedroom", "2 Bedroom", "3 Bedroom", "Kost", "Rumah", "Villa"];

export type LeadFormValue = {
  name: string;
  phone: string;
  budget: string;
  unit_type: string;
  preferred_location: string;
  move_in_date: string;
  requirements: string;
  notes: string;
  next_followup_date: string;
};

export const emptyLeadForm: LeadFormValue = {
  name: "", phone: "", budget: "", unit_type: "", preferred_location: "", move_in_date: "",
  requirements: "", notes: "", next_followup_date: "",
};

export function leadToForm(l: any): LeadFormValue {
  return {
    name: l.name || "",
    phone: l.phone || "",
    budget: moneyInput(l.budget_max || l.budget_min),
    unit_type: l.unit_type || "",
    preferred_location: l.preferred_location || "",
    move_in_date: l.move_in_date || "",
    requirements: (l.requirements || []).join(", "),
    notes: l.notes || "",
    next_followup_date: l.next_followup_date || "",
  };
}

export function formToBody(f: LeadFormValue) {
  return {
    name: f.name.trim(),
    phone: f.phone.trim() || null,
    budget_max: parseMoney(f.budget),
    unit_type: f.unit_type || null,
    preferred_location: f.preferred_location.trim() || null,
    move_in_date: f.move_in_date.trim() || null,
    requirements: f.requirements.split(",").map((x) => x.trim()).filter(Boolean),
    notes: f.notes.trim() || null,
    next_followup_date: f.next_followup_date || null,
  };
}

export function LeadForm({ value, onChange, startExpanded = false }: { value: LeadFormValue; onChange: (v: LeadFormValue) => void; startExpanded?: boolean }) {
  const s = useStyles();
  const [more, setMore] = useState(startExpanded);
  const set = (k: keyof LeadFormValue) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <View style={{ gap: spacing.md }}>
      <Field label="Nama">
        <Input testID="lead-name-input" value={value.name} onChangeText={set("name")} placeholder="mis. Jessica" autoCapitalize="words" />
      </Field>
      <Field label="No. WhatsApp">
        <Input testID="lead-phone-input" value={value.phone} onChangeText={set("phone")} placeholder="0812…" keyboardType="phone-pad" />
      </Field>
      <Field label="Budget per bulan">
        <Input testID="lead-budget-input" value={value.budget} onChangeText={(v) => set("budget")(moneyInput(parseMoney(v)))} placeholder="3.500.000" keyboardType="numeric" />
      </Field>
      <Field label="Cari tipe">
        <View style={s.wrap}>
          {UNIT_TYPES.map((t) => (
            <Chip key={t} label={t} active={value.unit_type === t} onPress={() => set("unit_type")(value.unit_type === t ? "" : t)} testID={`lead-type-${t}`} />
          ))}
        </View>
      </Field>

      {more ? (
        <>
          <Field label="Lokasi yang diinginkan">
            <Input testID="lead-location-input" value={value.preferred_location} onChangeText={set("preferred_location")} placeholder="mis. Canggu, PIK 2" />
          </Field>
          <Field label="Rencana pindah">
            <Input testID="lead-movein-input" value={value.move_in_date} onChangeText={set("move_in_date")} placeholder="mis. bulan depan, 1 Oktober" />
          </Field>
          <Field label="Kebutuhan (pisah pakai koma)">
            <Input testID="lead-reqs-input" value={value.requirements} onChangeText={set("requirements")} placeholder="furnished, boleh hewan, dekat stasiun" />
          </Field>
          <Field label="Catatan">
            <Textarea testID="lead-notes-input" value={value.notes} onChangeText={set("notes")} placeholder="Info penting dari chat, mis. 'nunggu diskusi sama suami'" style={{ minHeight: 80 }} />
          </Field>
          <Field label="Follow-up tanggal" hint="Muncul di Hari Ini pada tanggal ini.">
            <DateInput testID="lead-followup-date" value={value.next_followup_date} onChange={set("next_followup_date")} />
          </Field>
        </>
      ) : (
        <Pressable onPress={() => setMore(true)} testID="lead-more-toggle" style={{ paddingVertical: 4 }}>
          <RNText style={s.more}>+ Lokasi, rencana pindah, kebutuhan, catatan</RNText>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  more: { color: colors.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 13 },
}));
