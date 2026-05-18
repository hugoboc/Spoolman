import {
  BarcodeOutlined,
  BgColorsOutlined,
  CalendarOutlined,
  ColumnWidthOutlined,
  CommentOutlined,
  DollarOutlined,
  FireOutlined,
  NumberOutlined,
  TagsOutlined,
  TrademarkCircleOutlined,
  ApartmentOutlined,
  DatabaseOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import { useTranslate } from "@refinedev/core";
import { Modal } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import type { ReactNode } from "react";
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

    const missingValue = "-";
    const vendorName = curFilament.vendor?.name;
    const vendorId = curFilament.vendor?.id;
    const displayName = curFilament.name ?? `ID: ${curFilament.id}`;
    const titleName = vendorName ? `${vendorName} - ${displayName}` : displayName;
    const registeredDate = dayjs.utc(curFilament.registered).local().format("YYYY-MM-DD HH:mm:ss");

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
      options: { wide?: boolean; plain?: boolean; key?: string } = {},
    ) => (
      <div
        key={options.key}
        className={[
          "spoolman-filament-detail-field",
          options.wide ? "spoolman-filament-detail-field-wide" : "",
          options.plain ? "spoolman-filament-detail-field-plain" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {!options.plain && <span className="spoolman-filament-detail-icon">{icon}</span>}
        <span className="spoolman-filament-detail-label">{label}</span>
        <span className="spoolman-filament-detail-value">{renderValue(value)}</span>
      </div>
    );

    const renderSection = (title: ReactNode, children: ReactNode, className = "") => (
      <section className={["spoolman-filament-detail-section", className].filter(Boolean).join(" ")}>
        {title && <h3 className="spoolman-filament-detail-section-title">{title}</h3>}
        {children}
      </section>
    );

    const colorValue = colorObj ? (
      <span className="spoolman-filament-detail-color-value">
        <SpoolIcon color={colorObj} no_margin />
        {curFilament.color_hex ? <span>#{curFilament.color_hex}</span> : null}
      </span>
    ) : (
      missingValue
    );

    const hasExtraFields = extraFields.data && extraFields.data.length > 0;

    return (
      <Modal
        open
        onCancel={() => setCurFilament(null)}
        width={980}
        footer={null}
        className="spoolman-filament-detail-modal"
      >
        <div className="spoolman-filament-detail">
          <header className="spoolman-filament-detail-header">
            <div className="spoolman-filament-detail-hero-swatch">
              {colorObj ? <SpoolIcon color={colorObj} size="large" no_margin /> : null}
            </div>
            <div className="spoolman-filament-detail-heading">
              <span className="spoolman-filament-detail-pill">FILAMENT #{curFilament.id}</span>
              <h2>{titleName}</h2>
            </div>
            <div className="spoolman-filament-detail-registered">
              <span>{t("filament.fields.registered")}</span>
              <strong>
                {registeredDate}
                <CalendarOutlined aria-hidden="true" />
              </strong>
            </div>
          </header>

          {renderSection(
            null,
            <div className="spoolman-filament-detail-grid">
              {renderField(t("filament.fields.id"), curFilament.id, <ApartmentOutlined />)}
              {renderField(t("filament.fields.name"), curFilament.name, <TagsOutlined />)}
              {renderField(
                t("filament.fields.vendor"),
                vendorId ? <a href={`/vendor/show/${vendorId}`}>{vendorName}</a> : vendorName,
                <TrademarkCircleOutlined />,
              )}
              {renderField(
                t("filament.fields.price"),
                curFilament.price !== undefined ? currencyFormatter.format(curFilament.price) : missingValue,
                <DollarOutlined />,
              )}
              {renderField(t("filament.fields.material"), curFilament.material, <DatabaseOutlined />, { wide: true })}
              {renderField(t("filament.fields.color_hex"), colorValue, <BgColorsOutlined />, { wide: true })}
              {renderField(t("filament.fields.comment"), enrichText(curFilament.comment), <CommentOutlined />, {
                wide: true,
              })}
            </div>,
          )}

          {renderSection(
            t("filament.titles.physical_properties", { defaultValue: "Physical Properties" }),
            <div className="spoolman-filament-detail-grid">
              {renderField(
                t("filament.fields.density"),
                <NumberFieldUnit
                  value={curFilament.density}
                  unit="g/cm³"
                  options={{ maximumFractionDigits: 2, minimumFractionDigits: 2 }}
                />,
                <ColumnWidthOutlined />,
              )}
              {renderField(
                t("filament.fields.diameter"),
                <NumberFieldUnit
                  value={curFilament.diameter}
                  unit="mm"
                  options={{ maximumFractionDigits: 2, minimumFractionDigits: 2 }}
                />,
                <NumberOutlined />,
              )}
              {renderField(
                t("filament.fields.weight"),
                curFilament.weight !== undefined ? (
                  <NumberFieldUnit
                    value={curFilament.weight}
                    unit="g"
                    options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
                  />
                ) : (
                  missingValue
                ),
                <InboxOutlined />,
              )}
              {renderField(
                t("filament.fields.spool_weight"),
                curFilament.spool_weight !== undefined ? (
                  <NumberFieldUnit
                    value={curFilament.spool_weight}
                    unit="g"
                    options={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
                  />
                ) : (
                  missingValue
                ),
                <DatabaseOutlined />,
              )}
            </div>,
          )}

          {renderSection(
            t("filament.titles.print_settings", { defaultValue: "Print Settings" }),
            <div className="spoolman-filament-detail-grid">
              {renderField(
                t("filament.fields.settings_extruder_temp"),
                curFilament.settings_extruder_temp !== undefined ? (
                  <NumberFieldUnit value={curFilament.settings_extruder_temp} unit="°C" />
                ) : (
                  missingValue
                ),
                <FireOutlined />,
              )}
              {renderField(
                t("filament.fields.settings_bed_temp"),
                curFilament.settings_bed_temp !== undefined ? (
                  <NumberFieldUnit value={curFilament.settings_bed_temp} unit="°C" />
                ) : (
                  missingValue
                ),
                <FireOutlined />,
              )}
            </div>,
          )}

          {renderSection(
            null,
            <div className="spoolman-filament-detail-grid spoolman-filament-detail-grid-plain">
              {renderField(t("filament.fields.article_number"), curFilament.article_number, <BarcodeOutlined />, {
                plain: true,
              })}
              {renderField(t("filament.fields.external_id"), curFilament.external_id, <BarcodeOutlined />, {
                plain: true,
              })}
            </div>,
          )}

          {hasExtraFields && (
            <section className="spoolman-filament-detail-section">
              <h3 className="spoolman-filament-detail-section-title">{t("settings.extra_fields.tab")}</h3>
              <div className="spoolman-filament-detail-grid">
                {extraFields.data!.map((field) =>
                  renderField(
                    field.name,
                    <ExtraFieldDisplay field={field} value={curFilament.extra[field.key]} />,
                    <TagsOutlined />,
                    { key: field.key, wide: true },
                  ),
                )}
              </div>
            </section>
          )}
        </div>
      </Modal>
    );
  }, [curFilament, t, extraFields.data, currencyFormatter]);

  return { openFilamentShowModal, filamentShowModal };
}
