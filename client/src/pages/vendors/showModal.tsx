import { useTranslate } from "@refinedev/core";
import { Descriptions, Modal, Typography } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useCallback, useMemo, useState } from "react";
import { ExtraFieldDisplay } from "../../components/extraFields";
import { NumberFieldUnit } from "../../components/numberField";
import { enrichText } from "../../utils/parsing";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { IVendor } from "./model";

dayjs.extend(utc);

export function useVendorShowModal() {
  const t = useTranslate();
  const extraFields = useGetFields(EntityType.vendor);

  const [curVendor, setCurVendor] = useState<IVendor | null>(null);

  const openVendorShowModal = useCallback((vendor: IVendor) => {
    setCurVendor(vendor);
  }, []);

  const vendorShowModal = useMemo(() => {
    if (!curVendor) return null;

    const modalTitle = t("vendor.titles.show_title", {
      id: curVendor.id,
      name: curVendor.name,
      interpolation: { escapeValue: false },
    });

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
        onCancel={() => setCurVendor(null)}
        width={600}
        footer={null}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label={t("vendor.fields.id")} span={1}>
              {curVendor.id}
            </Descriptions.Item>
            <Descriptions.Item label={t("vendor.fields.registered")} span={1}>
              {dayjs.utc(curVendor.registered).local().format("YYYY-MM-DD HH:mm:ss")}
            </Descriptions.Item>
            <Descriptions.Item label={t("vendor.fields.name")} span={2}>
              {curVendor.name}
            </Descriptions.Item>
            <Descriptions.Item label={t("vendor.fields.empty_spool_weight")} span={1}>
              {curVendor.empty_spool_weight !== undefined ? (
                <NumberFieldUnit
                  value={curVendor.empty_spool_weight}
                  unit="g"
                  options={{ maximumFractionDigits: 0 }}
                />
              ) : (
                ""
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t("vendor.fields.external_id")} span={1}>
              {curVendor.external_id ?? ""}
            </Descriptions.Item>
            <Descriptions.Item label={t("vendor.fields.comment")} span={2}>
              {enrichText(curVendor.comment)}
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
                  <ExtraFieldDisplay field={field} value={curVendor.extra[field.key]} />
                </Descriptions.Item>
              ))}
            </Descriptions>
          )}
        </div>
      </Modal>
    );
  }, [curVendor, t, extraFields.data]);

  return { openVendorShowModal, vendorShowModal };
}
