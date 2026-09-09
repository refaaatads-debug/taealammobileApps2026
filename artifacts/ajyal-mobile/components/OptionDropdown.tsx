import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/AjyalUI";
import { useColors } from "@/hooks/useColors";
import { useAppPreferences } from "@/contexts/AppPreferencesContext";

type OptionDropdownProps = {
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  onChange: (value: string) => void;
  testID: string;
  loading?: boolean;
  disabled?: boolean;
};

export function OptionDropdown({
  label,
  value,
  placeholder,
  options,
  onChange,
  testID,
  loading = false,
  disabled = false,
}: OptionDropdownProps) {
  const colors = useColors();
  const { direction, t } = useAppPreferences();
  const [open, setOpen] = useState(false);
  const selected = value || placeholder;

  return (
    <>
      <View style={styles.wrap}>
        <Text style={[styles.label, { color: colors.foreground, writingDirection: direction }]}>{label}</Text>
        <Pressable
          testID={testID}
          disabled={disabled || loading || !options.length}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.trigger,
            {
              backgroundColor: colors.card,
              borderColor: value ? colors.teal : colors.border,
              opacity: disabled || loading ? 0.6 : 1,
            },
            pressed && styles.pressed,
          ]}
        >
          <Icon name="chevron-down" size={17} color={value ? colors.teal : colors.mutedForeground} />
          <Text
            numberOfLines={1}
            style={[
              styles.value,
              { color: value ? colors.foreground : colors.mutedForeground, writingDirection: direction },
            ]}
          >
            {loading ? t("جارٍ تحميل الخيارات…", "Loading options…") : selected}
          </Text>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sheetHeader}>
              <Pressable testID={`${testID}-close`} onPress={() => setOpen(false)} hitSlop={8}>
                <Icon name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
              <Text style={[styles.sheetTitle, { color: colors.foreground, writingDirection: direction }]}>{label}</Text>
            </View>
            <ScrollView style={styles.options} contentContainerStyle={styles.optionsContent} showsVerticalScrollIndicator={false}>
              {options.map((option) => {
                const active = option === value;
                return (
                  <Pressable
                    key={option}
                    testID={`${testID}-option-${option}`}
                    onPress={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      { backgroundColor: active ? colors.tealSoft : colors.background, borderColor: active ? colors.teal : colors.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon name={active ? "check" : "circle"} size={16} color={active ? colors.teal : colors.mutedForeground} />
                    <Text style={[styles.optionText, { color: active ? colors.teal : colors.foreground, writingDirection: direction }]}>{option}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 13 },
  label: { fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl", marginBottom: 7 },
  trigger: { minHeight: 52, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  value: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "right", writingDirection: "rtl" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(10, 25, 45, 0.42)" },
  sheet: { maxHeight: "78%", borderTopLeftRadius: 25, borderTopRightRadius: 25, borderWidth: 1, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 25 },
  sheetHeader: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sheetTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "right", writingDirection: "rtl" },
  options: { maxHeight: 430 },
  optionsContent: { gap: 8, paddingBottom: 4 },
  option: { minHeight: 47, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  optionText: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "right", writingDirection: "rtl" },
  pressed: { opacity: 0.72 },
});