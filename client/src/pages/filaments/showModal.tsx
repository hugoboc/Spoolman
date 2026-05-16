import { useInvalidate, useTranslate } from "@refinedev/core";
import { Descriptions, Modal, Space, Typography } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useCallback, useMemo, useState } from "react";
import { ExtraFieldDisplay } from "../../components/extraFields";
import { NumberFieldUnit } from "../../components/numberField";
import SpoolIcon from "../../components/spoolIcon";
import { enrichText } from "../../utils/parsing";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { useCurrencyFormatter } from "../../utils/settings";
import { IFilament } from "./model";

dayjs.extend(utc);

export function useFilamentShowModal() {
  const t = useTranslate();
  const extraFields = useGetFields(EntityType.filament);
  const currencyFormatter = useCurrencyFormatter();

  const [curFilament, setCurFilament] = useState<IFilament | null>(null);

  const openFilamentShowModal = useCallback((filament: IFilament) => {
    setCurFilament(filament);
  }, []);

  const filamentShowModal = useMemo(() => {
    if (!curFilament) return null;

    const colorObj = curFilament.multi_color_hexes
      ? {
          colors: curFilament.multi_color_hexes.split(","),
          vertical: curFilament.multi_color_direction === "longitudinal",
        }
      : curFilament.color_hex;

    const vendorName = curFilament.vendor?.name;
    const vendorId = curFilament.vendor?.id;
    const displayName = curFilament.name ?? `ID: ${curFilament.id}`;
    const titleName = vendorName ? `${vendorName} - ${displayName}` : displayName;

    const modalTitle = (
      <Space align="center" size={12}>
        {colorObj && <SpoolIcon color={colorObj} size="large" no_margin />}
        <span>
          {t("filament.titles.show_title", {
            id: curFilament.id,
            name: titleName,
            interpolation: { escapeValue: false },
          })}
        </span>
      </Space>
    );

    const hasExtraFields = extraFields.data && extraFields.data.length > 0;

    const sectionLabel = (text: string) => (
      <Typography.Text
        type="secondary"
        style={{ fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}
      >
        {text}
      </Typography.Text>
    );

    return (
      <Modal
        open
        title={modalTitle}
        onCancel={() => setCurFilament(null)}
        width={700}
        footer={null}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label={t("filament.fields.id")} span={1}>
              {curFilament.id}
            </Descriptions.Item>
            <Descriptions.Item label={t("filament.fields.registered")} span={1}>
              {dayjs.utc(curFilament.registered).local().format("YYYY-MM-DD HH:mm:ss")}
            </Descriptions.Item>
            <Descriptions.Item label={t("filament.fields.vendor")} span={1}>
              {vendorId ? <a href={`/vendor/show/${vendorId}`}>{vendorName}</a> : (vendorName ?? "")}
            </Descriptions.Item>
            <Descriptions.Item label={t("filament.fields.name")} span={1}>
              {curFilament.name ?? ""}
            </Descriptions.Item>
            <Descriptions.Item label={t("filament.fields.material")} span={1}>
              {curFilament.material ?? ""}
            </Descriptions.Item>
            <Descriptions.Item label={t("filament.fields.price")} span={1}>
              {curFilament.price !== undefined ? currencyFormatter.format(curFilament.price) : ""}
            </Descriptions.Item>
            {colorObj && (
              <Descriptions.Item label={t("filament.fields.color_hex")} span={2}>
                <Space>
                  <SpoolIcon color={colorObj} />
                  {curFilament.color_hex && <span>#{curFilament.color_hex}</span>}
                </Space>
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t("filament.fields.comment")} span={2}>
              {enrichText(curFilament.comment)}
            </Descriptions.Item>
          </Descriptions>

          <Descriptions
            bordered
            size="small"
            column={2}
            title={sectionLabel(t("filament.titles.physical_properties", { defaultValue: "Physical Properties" }))}
          >
            <Descriptions.Item label={t("filament.fields.density")} span={1}>
              <NumberFieldUnit
                value={curFilament.density}
                unit="g/cm³"
                options={{ maximumFractionDigits: 2, minimumFractionDigits: 2 }}
              />
            </Descriptions.Item>
            <Descriptions.Item label={t("filament.fields.diameter")} span={1}>
              <NumberFieldUnit
                value={curFilament.diameter}
                unit="mm"
                options={{ maximumFractionDigits: 2, minimumFractionDigits: 2 }}
              />
            </Descriptions.Item>
            <Descriptions.Item label={t("filament.fields.weight")} span={1}>
              <NumberFieldUnit
                value={curFilament.weight ?? ""}
                unit="g"
                options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
              />
            </Descriptions.Item>
            <Descriptions.Item label={t("filament.fields.spool_weight")} span={1}>
              <NumberFieldUnit
                value={curFilament.spool_weight ?? ""}
                unit="g"
                options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
              />
            </Descriptions.Item>
          </Descriptions>

          <Descriptions
            bordered
            size="small"
            column={2}
            title={sectionLabel(t("filament.titles.print_settings", { defaultValue: "Print Settings" }))}
          >
            <Descriptions.Item label={t("filament.fields.settings_extruder_temp")} span={1}>
              {curFilament.settings_extruder_temp !== undefined ? (
                <NumberFieldUnit value={curFilament.settings_extruder_temp} unit="°C" />
              ) : (
                t("not_set", { defaultValue: "Not Set" })
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t("filament.fields.settings_bed_temp")} span={1}>
              {curFilament.settings_bed_temp !== undefined ? (
                <NumberFieldUnit value={curFilament.settings_bed_temp} unit="°C" />
              ) : (
                t("not_set", { defaultValue: "Not Set" })
              )}
            </Descriptions.Item>
          </Descriptions>

          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label={t("filament.fields.article_number")} span={1}>
              {curFilament.article_number ?? ""}
            </Descriptions.Item>
            <Descriptions.Item label={t("filament.fields.external_id")} span={1}>
              {curFilament.external_id ?? ""}
            </Descriptions.Item>
          </Descriptions>

          {hasExtraFields && (
            <Descriptions
              bordered
              size="small"
              column={1}
              title={sectionLabel(t("settings.extra_fields.tab"))}
            >
              {extraFields.data!.map((field) => (
                <Descriptions.Item key={field.key} label={field.name} span={1}>
                  <ExtraFieldDisplay field={field} value={curFilament.extra[field.key]} />
                </Descriptions.Item>
              ))}
            </Descriptions>
          )}
        </div>
      </Modal>
    );
  }, [curFilament, t, extraFields.data, currencyFormatter]);

  return { openFilamentShowModal, filamentShowModal };
}
