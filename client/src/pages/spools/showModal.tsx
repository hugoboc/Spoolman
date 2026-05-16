import { InboxOutlined, PrinterOutlined, ToTopOutlined, ToolOutlined } from "@ant-design/icons";
import { useInvalidate, useTranslate } from "@refinedev/core";
import { Button, Descriptions, Modal, Space, Typography } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useCallback, useMemo, useState } from "react";
import SpoolIcon from "../../components/spoolIcon";
import { NumberFieldUnit } from "../../components/numberField";
import { ExtraFieldDisplay } from "../../components/extraFields";
import { enrichText } from "../../utils/parsing";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { useCurrencyFormatter } from "../../utils/settings";
import { getBasePath } from "../../utils/url";
import { IFilament } from "../filaments/model";
import { setSpoolArchived, useSpoolAdjustModal } from "./functions";
import { ISpool } from "./model";

dayjs.extend(utc);

const { confirm } = Modal;

function formatFilamentName(item: IFilament): string {
  let vendorPrefix = "";
  if (item.vendor && "name" in item.vendor) {
    vendorPrefix = `${item.vendor.name} - `;
  }
  const name = item.name ?? `ID: ${item.id}`;
  const material = item.material ? ` - ${item.material}` : "";
  return `${vendorPrefix}${name}${material}`;
}

export function useSpoolShowModal() {
  const t = useTranslate();
  const invalidate = useInvalidate();
  const extraFields = useGetFields(EntityType.spool);
  const currencyFormatter = useCurrencyFormatter();
  const { openSpoolAdjustModal, spoolAdjustModal } = useSpoolAdjustModal();

  const [curSpool, setCurSpool] = useState<ISpool | null>(null);

  const openSpoolShowModal = useCallback((spool: ISpool) => {
    setCurSpool(spool);
  }, []);

  const archiveSpool = useCallback(
    async (spool: ISpool, archive: boolean) => {
      await setSpoolArchived(spool, archive);
      setCurSpool((prev) => (prev ? { ...prev, archived: archive } : null));
      invalidate({ resource: "spool", id: spool.id, invalidates: ["list", "detail"] });
    },
    [invalidate],
  );

  const archiveSpoolPopup = useCallback(
    (spool: ISpool) => {
      if (spool.remaining_weight != undefined && spool.remaining_weight <= 0) {
        archiveSpool(spool, true);
      } else {
        confirm({
          title: t("spool.titles.archive"),
          content: t("spool.messages.archive"),
          okText: t("buttons.archive"),
          okType: "primary",
          cancelText: t("buttons.cancel"),
          onOk() {
            return archiveSpool(spool, true);
          },
        });
      }
    },
    [t, archiveSpool],
  );

  const spoolShowModal = useMemo(() => {
    if (!curSpool) return null;

    const colorObj = curSpool.filament.multi_color_hexes
      ? {
          colors: curSpool.filament.multi_color_hexes.split(","),
          vertical: curSpool.filament.multi_color_direction === "longitudinal",
        }
      : curSpool.filament.color_hex;

    const spoolPrice = curSpool.price ?? curSpool.filament.price;
    const filamentName = formatFilamentName(curSpool.filament);
    const filamentURL = `/filament/show/${curSpool.filament.id}`;

    const modalTitle = (
      <Space align="center" size={12}>
        {colorObj && <SpoolIcon color={colorObj} size="large" no_margin />}
        <span>
          {t("spool.titles.show_title", {
            id: curSpool.id,
            name: filamentName,
            interpolation: { escapeValue: false },
          })}
        </span>
      </Space>
    );

    const hasExtraFields = extraFields.data && extraFields.data.length > 0;

    return (
      <>
        {spoolAdjustModal}
        <Modal
          open
          title={modalTitle}
          onCancel={() => setCurSpool(null)}
          width={700}
          footer={
            <Space wrap>
              <Button
                type="primary"
                icon={<ToolOutlined />}
                onClick={() => openSpoolAdjustModal(curSpool)}
              >
                {t("spool.titles.adjust")}
              </Button>
              <Button
                icon={<PrinterOutlined />}
                href={
                  getBasePath() +
                  "/spool/print?spools=" +
                  curSpool.id +
                  "&return=" +
                  encodeURIComponent(window.location.pathname)
                }
              >
                {t("printing.qrcode.button")}
              </Button>
              {curSpool.archived ? (
                <Button icon={<ToTopOutlined />} onClick={() => archiveSpool(curSpool, false)}>
                  {t("buttons.unArchive")}
                </Button>
              ) : (
                <Button danger icon={<InboxOutlined />} onClick={() => archiveSpoolPopup(curSpool)}>
                  {t("buttons.archive")}
                </Button>
              )}
              <Button onClick={() => setCurSpool(null)}>{t("buttons.cancel")}</Button>
            </Space>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label={t("spool.fields.id")} span={1}>
                {curSpool.id}
              </Descriptions.Item>
              <Descriptions.Item label={t("spool.fields.archived")} span={1}>
                {curSpool.archived ? t("yes") : t("no")}
              </Descriptions.Item>
              <Descriptions.Item label={t("spool.fields.filament")} span={2}>
                <a href={filamentURL}>{filamentName}</a>
              </Descriptions.Item>
              <Descriptions.Item label={t("spool.fields.price")} span={1}>
                {spoolPrice !== undefined ? currencyFormatter.format(spoolPrice) : ""}
              </Descriptions.Item>
              <Descriptions.Item label={t("spool.fields.location")} span={1}>
                {curSpool.location ?? ""}
              </Descriptions.Item>
              <Descriptions.Item label={t("spool.fields.lot_nr")} span={1}>
                {curSpool.lot_nr ?? ""}
              </Descriptions.Item>
              <Descriptions.Item label={t("spool.fields.comment")} span={2}>
                {enrichText(curSpool.comment)}
              </Descriptions.Item>
            </Descriptions>

            <Descriptions
              bordered
              size="small"
              column={2}
              title={
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {t("spool.titles.usage", { defaultValue: "Usage" })}
                </Typography.Text>
              }
            >
              <Descriptions.Item label={t("spool.fields.remaining_weight")} span={1}>
                <NumberFieldUnit
                  value={curSpool.remaining_weight ?? ""}
                  unit="g"
                  options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
                />
              </Descriptions.Item>
              <Descriptions.Item label={t("spool.fields.used_weight")} span={1}>
                <NumberFieldUnit
                  value={curSpool.used_weight ?? ""}
                  unit="g"
                  options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
                />
              </Descriptions.Item>
              <Descriptions.Item label={t("spool.fields.remaining_length")} span={1}>
                <NumberFieldUnit
                  value={curSpool.remaining_length ?? ""}
                  unit="mm"
                  options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
                />
              </Descriptions.Item>
              <Descriptions.Item label={t("spool.fields.used_length")} span={1}>
                <NumberFieldUnit
                  value={curSpool.used_length ?? ""}
                  unit="mm"
                  options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
                />
              </Descriptions.Item>
            </Descriptions>

            <Descriptions
              bordered
              size="small"
              column={2}
              title={
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {t("spool.titles.dates", { defaultValue: "Dates" })}
                </Typography.Text>
              }
            >
              <Descriptions.Item label={t("spool.fields.registered")} span={2}>
                {dayjs.utc(curSpool.registered).local().format("YYYY-MM-DD HH:mm:ss")}
              </Descriptions.Item>
              {curSpool.first_used && (
                <Descriptions.Item label={t("spool.fields.first_used")} span={1}>
                  {dayjs.utc(curSpool.first_used).local().format("YYYY-MM-DD HH:mm:ss")}
                </Descriptions.Item>
              )}
              {curSpool.last_used && (
                <Descriptions.Item label={t("spool.fields.last_used")} span={1}>
                  {dayjs.utc(curSpool.last_used).local().format("YYYY-MM-DD HH:mm:ss")}
                </Descriptions.Item>
              )}
            </Descriptions>

            {hasExtraFields && (
              <Descriptions
                bordered
                size="small"
                column={1}
                title={
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("settings.extra_fields.tab")}
                  </Typography.Text>
                }
              >
                {extraFields.data!.map((field) => (
                  <Descriptions.Item key={field.key} label={field.name} span={1}>
                    <ExtraFieldDisplay field={field} value={curSpool.extra[field.key]} />
                  </Descriptions.Item>
                ))}
              </Descriptions>
            )}
          </div>
        </Modal>
      </>
    );
  }, [curSpool, t, extraFields.data, currencyFormatter, openSpoolAdjustModal, spoolAdjustModal, archiveSpool, archiveSpoolPopup]);

  return { openSpoolShowModal, spoolShowModal };
}
