import React, { useState } from "react";
import { FlatList, Linking, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Sheet } from "@/src/components/Sheet";
import { TabHeader } from "@/src/components/TabHeader";
import { DateInput } from "@/src/components/DateInput";
import { CalendarActions } from "@/src/components/CalendarActions";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorBox, Field, IconCircle, Input, PressableScale, Spinner, StatusPill } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { api } from "@/src/lib/api";
import { useParamTrigger } from "@/src/lib/useParamTrigger";
import { t } from "@/src/lib/i18n";
import { dateTimeLabel, todayISO } from "@/src/lib/format";
import { todoCalendarLink, todoInformMessage, waLink } from "@/src/lib/messages";
import { fonts, makeStyles, spacing } from "@/src/theme";

// To-do list: something to handle for a tenant or unit (AC bocor, parkir…), when
// it will be handled, then: add to Google Calendar → [Batal] [Kabari Tenant].

const FILTERS = [
  { key: "aktif", label: "Aktif" },
  { key: "selesai", label: "Selesai" },
  { key: "semua", label: "Semua" },
];

type Todo = {
  id: string; description: string; status: string; unit_id?: string | null; tenant_id?: string | null;
  unit_name?: string | null; tenant_name?: string | null; tenant_phone?: string | null; location?: string | null;
  scheduled_at?: string | null; calendar_added?: boolean;
};

export default function TodoScreen() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const s = useStyles();
  const [filter, setFilter] = useState("aktif");
  const [addOpen, setAddOpen] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<Todo | null>(null);
  useParamTrigger("add", () => setAddOpen(true));

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["maintenance"], queryFn: () => api<Todo[]>("/maintenance") });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["maintenance"] });
    qc.invalidateQueries({ queryKey: ["today"] });
  };
  const onErr = (e: any) => toast(e?.message || t("Gagal. Coba lagi."), "error");

  const markCalendar = useMutation({ mutationFn: (id: string) => api(`/maintenance/${id}/calendar`, { method: "POST" }), onSuccess: refresh, onError: onErr });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/maintenance/${id}/cancel`, { method: "POST" }),
    onSuccess: () => { refresh(); toast(t("To-do dibatalkan")); },
    onError: onErr,
  });
  const resolve = useMutation({
    mutationFn: (id: string) => api(`/maintenance/${id}/resolve`, { method: "POST" }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ["units"] }); toast(t("To-do selesai")); },
    onError: onErr,
  });

  const open = (data || []).filter((m) => m.status === "baru" || m.status === "sedang");
  const rows = (data || []).filter((m) =>
    filter === "aktif" ? m.status === "baru" || m.status === "sedang" : filter === "selesai" ? m.status === "selesai" || m.status === "batal" : true,
  );

  const addToCalendar = (m: Todo) => {
    // Opened inside the tap so the browser doesn't treat it as a pop-up.
    Linking.openURL(todoCalendarLink({ ...m, scheduled_at: m.scheduled_at! }));
    markCalendar.mutate(m.id);
  };

  return (
    <View style={s.root}>
      <TabHeader
        title={t("To-do list")}
        menu
        sub={data ? t("{n} belum selesai", { n: open.length }) : null}
        right={<Button title={t("Tambah")} icon="plus" size="sm" onPress={() => setAddOpen(true)} testID="add-todo-button" />}
      />
      <ChipRow testID="todo-filter-row">
        {FILTERS.map((f) => (
          <Chip key={f.key} label={t(f.label)} active={filter === f.key} onPress={() => setFilter(f.key)} testID={`todo-filter-${f.key}`} />
        ))}
      </ChipRow>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <View style={{ padding: spacing.lg }}><ErrorBox message={(error as any)?.message} onRetry={refetch} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.list}
          renderItem={({ item: m }) => {
            const done = m.status === "selesai" || m.status === "batal";
            const wa = waLink(m.tenant_phone);
            return (
              <Card testID={`todo-card-${m.id}`} style={{ gap: spacing.md }}>
                <View style={s.head}>
                  <IconCircle icon="list-check" tone={done ? "success" : "warning"} size={42} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <RNText style={s.title}>{m.description}</RNText>
                    <RNText style={s.sub} numberOfLines={1}>
                      {[m.unit_name ? t("Unit {name}", { name: m.unit_name }) : null, m.tenant_name].filter(Boolean).join(" · ") || t("Tanpa unit")}
                    </RNText>
                  </View>
                  {done ? <StatusPill label={m.status === "batal" ? t("Batal") : t("Selesai")} tone={m.status === "batal" ? "neutral" : "success"} /> : null}
                </View>
                {!done ? (
                  <PressableScale soft onPress={() => setScheduleFor(m)} testID={`todo-schedule-${m.id}`} style={s.when}>
                    <RNText style={[s.whenText, !m.scheduled_at && s.whenEmpty]}>
                      {m.scheduled_at ? dateTimeLabel(m.scheduled_at) : t("Atur tanggal & jam")}
                    </RNText>
                    <RNText style={s.whenEdit}>{m.scheduled_at ? t("Ubah") : "›"}</RNText>
                  </PressableScale>
                ) : null}
                {!done && m.scheduled_at ? (
                  <CalendarActions
                    added={!!m.calendar_added}
                    onAdd={() => addToCalendar(m)}
                    onCancel={() => cancel.mutate(m.id)}
                    primaryLabel={t("Kabari Tenant")}
                    onPrimary={wa ? () => Linking.openURL(waLink(m.tenant_phone, todoInformMessage({ ...m, scheduled_at: m.scheduled_at! }))!) : null}
                    testID={`todo-cal-${m.id}`}
                  />
                ) : null}
                {!done ? (
                  <PressableScale onPress={() => resolve.mutate(m.id)} testID={`todo-done-${m.id}`} style={s.doneLink}>
                    <RNText style={s.doneText}>{t("Tandai selesai")}</RNText>
                  </PressableScale>
                ) : null}
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              art="issues"
              title={filter === "aktif" ? t("Tidak ada to-do") : t("Belum ada yang selesai")}
              subtitle={t("Catat kendala unit atau permintaan tenant, lalu jadwalkan kapan diurus.")}
              action={filter === "aktif" ? <Button title={t("Tambah To-do")} icon="plus" onPress={() => setAddOpen(true)} testID="empty-add-todo" /> : undefined}
            />
          }
        />
      )}

      {addOpen ? <AddTodoSheet onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); refresh(); toast(t("To-do tersimpan")); }} /> : null}
      {scheduleFor ? (
        <ScheduleSheet todo={scheduleFor} onClose={() => setScheduleFor(null)} onDone={() => { setScheduleFor(null); refresh(); }} />
      ) : null}
    </View>
  );
}

function AddTodoSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const s = useStyles();
  const { toast } = useToast();
  const { data: tenants } = useQuery({ queryKey: ["tenants"], queryFn: () => api<any[]>("/tenants") });
  const { data: units } = useQuery({ queryKey: ["units", "semua"], queryFn: () => api<any[]>("/units?status=semua") });
  const [f, setF] = useState({ tenant_id: "", unit_id: "", description: "", date: todayISO(), time: "10:00" });

  // Pick one and the other follows: a tenant brings their unit; a unit brings its tenant.
  const pickTenant = (tn: any) =>
    setF((c) => (c.tenant_id === tn.id ? { ...c, tenant_id: "", unit_id: "" } : { ...c, tenant_id: tn.id, unit_id: tn.unit_id }));
  const pickUnit = (u: any) => {
    if (f.unit_id === u.id) return setF((c) => ({ ...c, unit_id: "", tenant_id: "" }));
    const tn = (tenants || []).find((x) => x.unit_id === u.id);
    setF((c) => ({ ...c, unit_id: u.id, tenant_id: tn?.id || "" }));
  };

  const save = useMutation({
    mutationFn: () =>
      api("/maintenance", {
        method: "POST",
        body: {
          description: f.description.trim(),
          unit_id: f.unit_id || null,
          tenant_id: f.tenant_id || null,
          scheduled_at: f.date && f.time ? `${f.date}T${f.time}` : null,
        },
      }),
    onSuccess: onDone,
    onError: (e: any) => toast(e?.message || t("Gagal menyimpan"), "error"),
  });

  return (
    <Sheet visible onClose={onClose} title={t("To-do baru")} testID="add-todo-sheet" scroll>
      <View style={{ gap: spacing.md }}>
        {(tenants || []).length ? (
          <Field label={t("Tenant")}>
            <View style={s.chips}>
              {tenants!.map((tn) => (
                <Chip key={tn.id} label={`${tn.name} · ${tn.unit_name}`} active={f.tenant_id === tn.id} onPress={() => pickTenant(tn)} testID={`todo-tenant-${tn.id}`} />
              ))}
            </View>
          </Field>
        ) : null}
        <Field label={t("Unit")} hint={units && !units.length ? t("Belum ada unit. Tambah unit dulu.") : undefined}>
          <View style={s.chips}>
            {(units || []).map((u) => (
              <Chip key={u.id} label={u.name} active={f.unit_id === u.id} onPress={() => pickUnit(u)} testID={`todo-unit-${u.id}`} />
            ))}
          </View>
          {units && !units.length ? (
            <Button title={t("Tambah Unit")} icon="plus" variant="secondary" size="sm" onPress={() => { onClose(); router.push("/units?add=1" as any); }} testID="todo-add-unit" />
          ) : null}
        </Field>
        <Field label={t("Kendala")}>
          <Input
            testID="todo-description"
            value={f.description}
            onChangeText={(v) => setF((c) => ({ ...c, description: v }))}
            placeholder={t("mis. AC bocor, minta diurus parkir")}
            maxLength={300}
          />
        </Field>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t("Tanggal")}>
              <DateInput testID="todo-date" value={f.date} onChange={(v) => setF((c) => ({ ...c, date: v }))} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("Jam")}>
              <DateInput mode="time" testID="todo-time" value={f.time} onChange={(v) => setF((c) => ({ ...c, time: v }))} />
            </Field>
          </View>
        </View>
        <Button title={t("Simpan To-do")} onPress={() => save.mutate()} loading={save.isPending} disabled={f.description.trim().length < 3 || !f.unit_id || !f.date || !f.time} testID="todo-save" />
      </View>
    </Sheet>
  );
}

function ScheduleSheet({ todo, onClose, onDone }: { todo: Todo; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const cur = todo.scheduled_at ? new Date(todo.scheduled_at) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [date, setDate] = useState(cur ? `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}` : todayISO());
  const [time, setTime] = useState(cur ? `${pad(cur.getHours())}:${pad(cur.getMinutes())}` : "10:00");
  const save = useMutation({
    mutationFn: () => api(`/maintenance/${todo.id}`, { method: "PATCH", body: { scheduled_at: `${date}T${time}` } }),
    onSuccess: onDone,
    onError: (e: any) => toast(e?.message || t("Gagal menyimpan"), "error"),
  });
  return (
    <Sheet visible onClose={onClose} title={t("Jadwal to-do")} testID="todo-schedule-sheet">
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t("Tanggal")}><DateInput testID="todo-edit-date" value={date} onChange={setDate} /></Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("Jam")}><DateInput mode="time" testID="todo-edit-time" value={time} onChange={setTime} /></Field>
          </View>
        </View>
        <Button title={t("Simpan Jadwal")} onPress={() => save.mutate()} loading={save.isPending} testID="todo-edit-save" />
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl, gap: spacing.md, maxWidth: 760, width: "100%", alignSelf: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { color: colors.onSurface, ...fonts.semibold, fontSize: 17 },
  sub: { color: colors.onSurfaceSecondary, ...fonts.regular, fontSize: 14.5 },
  when: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: spacing.md, minHeight: 48 },
  whenText: { color: colors.onSurface, ...fonts.medium, fontSize: 15.5 },
  whenEmpty: { color: colors.brandPrimary, ...fonts.semibold },
  whenEdit: { color: colors.brandPrimary, ...fonts.semibold, fontSize: 14.5 },
  doneLink: { alignSelf: "center", paddingVertical: 6, paddingHorizontal: spacing.md },
  doneText: { color: colors.onSurfaceSecondary, ...fonts.medium, fontSize: 14.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
