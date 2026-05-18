import {
  BarcodeOutlined,
  CalendarOutlined,
  CommentOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  LinkOutlined,
  NumberOutlined,
  PrinterOutlined,
  TagsOutlined,
  ToTopOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useInvalidate, useTranslate } from "@refinedev/core";
import { Button, Modal, Space } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import type { ReactNode } from "react";
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
    const missingValue = "-";
    const registeredDate = dayjs.utc(curSpool.registered).local().format("YYYY-MM-DD HH:mm:ss");

    const renderValue = (value: ReactNode) => {
      if (value === undefined || value === null || value === "") {
        return <span className="spoolman-filament-detail-empty">{missingValue}</span>;
      }

      return value;
    };

    const renderField = (
      label: ReactNode,
      value: ReactNode,
      icon: ReactNode,
      options: { wide?: boolean; key?: string } = {},
    ) => (
      <div
        key={options.key}
        className={[
          "spoolman-filament-detail-field",
          options.wide ? "spoolman-filament-detail-field-wide" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="spoolman-filament-detail-icon">{icon}</span>
        <span className="spoolman-filament-detail-label">{label}</span>
        <span className="spoolman-filament-detail-value">{renderValue(value)}</span>
      </div>
    );

    const renderSection = (title: ReactNode, children: ReactNode) => (
      <section className="spoolman-filament-detail-section">
        {title && <h3 className="spoolman-filament-detail-section-title">{title}</h3>}
        {children}
      </section>
    );

    const hasExtraFields = extraFields.data && extraFields.data.length > 0;

    return (
      <>
        {spoolAdjustModal}
        <Modal
          open
          onCancel={() => setCurSpool(null)}
          width={980}
          className="spoolman-filament-detail-modal"
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
          <div className="spoolman-filament-detail">
            <header className="spoolman-filament-detail-header">
              <div className="spoolman-filament-detail-hero-swatch">
                {colorObj && <SpoolIcon color={colorObj} size="large" no_margin />}
              </div>
              <div className="spoolman-filament-detail-heading">
                <h2>{filamentName}</h2>
              </div>
              <div className="spoolman-filament-detail-registered">
                <span>{t("spool.fields.registered")}</span>
                <strong>
                  {registeredDate}
                  <CalendarOutlined aria-hidden="true" />
                </strong>
              </div>
            </header>

            {renderSection(
              null,
              <div className="spoolman-filament-detail-grid spoolman-filament-detail-grid-overview">
                {renderField(t("spool.fields.id"), curSpool.id, <NumberOutlined />)}
                {renderField(t("spool.fields.archived"), curSpool.archived ? t("yes") : t("no"), <InboxOutlined />)}
                {renderField(t("spool.fields.filament"), <a href={filamentURL}>{filamentName}</a>, <LinkOutlined />)}
                {renderField(
                  t("spool.fields.price"),
                  spoolPrice !== undefined ? currencyFormatter.format(spoolPrice) : missingValue,
                  <DollarOutlined />,
                )}
                {renderField(t("spool.fields.location"), curSpool.location, <EnvironmentOutlined />)}
                {renderField(t("spool.fields.lot_nr"), curSpool.lot_nr, <BarcodeOutlined />)}
                {renderField(t("spool.fields.comment"), enrichText(curSpool.comment), <CommentOutlined />, {
                  wide: true,
                })}
              </div>,
            )}

            {renderSection(
              t("spool.titles.usage", { defaultValue: "Usage" }),
              <div className="spoolman-filament-detail-grid">
                {renderField(
                  t("spool.fields.remaining_weight"),
                  curSpool.remaining_weight != undefined ? (
                    <NumberFieldUnit
                      value={curSpool.remaining_weight}
                      unit="g"
                      options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
                    />
                  ) : (
                    missingValue
                  ),
                  <InboxOutlined />,
                )}
                {renderField(
                  t("spool.fields.used_weight"),
                  curSpool.used_weight != undefined ? (
                    <NumberFieldUnit
                      value={curSpool.used_weight}
                      unit="g"
                      options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
                    />
                  ) : (
                    missingValue
                  ),
                  <InboxOutlined />,
                )}
                {renderField(
                  t("spool.fields.remaining_length"),
                  curSpool.remaining_length != undefined ? (
                    <NumberFieldUnit
                      value={curSpool.remaining_length}
                      unit="mm"
                      options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
                    />
                  ) : (
                    missingValue
                  ),
                  <NumberOutlined />,
                )}
                {renderField(
                  t("spool.fields.used_length"),
                  curSpool.used_length != undefined ? (
                    <NumberFieldUnit
                      value={curSpool.used_length}
                      unit="mm"
                      options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
                    />
                  ) : (
                    missingValue
                  ),
                  <NumberOutlined />,
                )}
              </div>,
            )}

            {renderSection(
              t("spool.titles.dates", { defaultValue: "Dates" }),
              <div className="spoolman-filament-detail-grid">
                {renderField(
                  t("spool.fields.first_used"),
                  curSpool.first_used
                    ? dayjs.utc(curSpool.first_used).local().format("YYYY-MM-DD HH:mm:ss")
                    : missingValue,
                  <CalendarOutlined />,
                )}
                {renderField(
                  t("spool.fields.last_used"),
                  curSpool.last_used
                    ? dayjs.utc(curSpool.last_used).local().format("YYYY-MM-DD HH:mm:ss")
                    : missingValue,
                  <CalendarOutlined />,
                )}
              </div>,
            )}

            {hasExtraFields && (
              <section className="spoolman-filament-detail-section">
                <h3 className="spoolman-filament-detail-section-title">{t("settings.extra_fields.tab")}</h3>
                <div className="spoolman-filament-detail-grid">
                  {extraFields.data!.map((field) =>
                    renderField(
                      field.name,
                      <ExtraFieldDisplay field={field} value={curSpool.extra[field.key]} />,
                      <TagsOutlined />,
                      { key: field.key, wide: true },
                    ),
                  )}
                </div>
              </section>
            )}
          </div>
        </Modal>
      </>
    );
  }, [curSpool, t, extraFields.data, currencyFormatter, openSpoolAdjustModal, spoolAdjustModal, archiveSpool, archiveSpoolPopup]);

  return { openSpoolShowModal, spoolShowModal };
}
