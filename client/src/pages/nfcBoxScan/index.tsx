import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useList, useTranslate } from "@refinedev/core";
import {
  Alert,
  Button,
  Input,
  Modal,
  Result,
  Select,
  Space,
  Spin,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { getAPIURL, getBasePath } from "../../utils/url";
import { IFilament } from "../filaments/model";
import { ISpool } from "../spools/model";
import { INfcBox } from "../nfcBoxes/model";

const { Title, Text } = Typography;

type PageState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "empty"; box: INfcBox }
  | { kind: "assigned"; box: INfcBox }
  | { kind: "activating"; box: INfcBox }
  | { kind: "activated"; box: INfcBox }
  | { kind: "activate_error"; box: INfcBox; message: string };

function spoolLabel(spool: ISpool): string {
  const filament = spool.filament as IFilament;
  const parts: string[] = [`#${spool.id}`];
  if (filament.vendor?.name) parts.push(filament.vendor.name);
  if (filament.material) parts.push(filament.material);
  if (filament.name) parts.push(filament.name);
  if (spool.location) parts.push(`(${spool.location})`);
  return parts.join(" — ");
}

export const NfcBoxScanPage = () => {
  const { token } = useParams<{ token: string }>();
  const t = useTranslate();

  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedSpoolId, setSelectedSpoolId] = useState<number | null>(null);
  const [spoolSearch, setSpoolSearch] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const apiUrl = getAPIURL();

  const fetchBox = useCallback(async () => {
    setPageState({ kind: "loading" });
    try {
      const res = await fetch(`${apiUrl}/nfc/box/${token}`);
      if (res.status === 404) {
        setPageState({ kind: "not_found" });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPageState({ kind: "error", message: body?.message ?? `HTTP ${res.status}` });
        return;
      }
      const box: INfcBox = await res.json();
      if (box.spool) {
        setPageState({ kind: "assigned", box });
      } else {
        setPageState({ kind: "empty", box });
      }
    } catch (err) {
      setPageState({ kind: "error", message: String(err) });
    }
  }, [apiUrl, token]);

  useEffect(() => {
    fetchBox();
  }, [fetchBox]);

  const { result: spoolData, query: spoolQuery } = useList<ISpool>({
    resource: "spool",
    meta: {
      queryParams: {
        allow_archived: false,
      },
    },
    pagination: { mode: "off" },
  });

  const allSpools = spoolData?.data ?? [];
  const filteredSpools = spoolSearch
    ? allSpools.filter((s) => spoolLabel(s).toLowerCase().includes(spoolSearch.toLowerCase()))
    : allSpools;

  const handleAssign = async () => {
    if (selectedSpoolId === null) return;
    setIsAssigning(true);
    try {
      const res = await fetch(`${apiUrl}/nfc/box/${token}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spool_id: selectedSpoolId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPageState((prev) => ({
          kind: "error",
          message: body?.message ?? `HTTP ${res.status}`,
          box: "box" in prev ? prev.box : undefined as unknown as INfcBox,
        }));
      } else {
        await fetchBox();
        setAssignModalOpen(false);
        setSelectedSpoolId(null);
      }
    } finally {
      setIsAssigning(false);
    }
  };

  const handleClear = async (box: INfcBox) => {
    setIsClearing(true);
    try {
      const res = await fetch(`${apiUrl}/nfc/box/${token}/clear`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPageState({ kind: "error", message: body?.message ?? `HTTP ${res.status}` });
      } else {
        await fetchBox();
      }
    } finally {
      setIsClearing(false);
    }
  };

  const handleActivate = async (box: INfcBox) => {
    setPageState({ kind: "activating", box });
    try {
      const res = await fetch(`${apiUrl}/nfc/box/${token}/activate`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPageState({ kind: "activate_error", box, message: body?.message ?? `HTTP ${res.status}` });
      } else {
        setPageState({ kind: "activated", box });
      }
    } catch (err) {
      setPageState({ kind: "activate_error", box, message: String(err) });
    }
  };

  const renderContent = () => {
    if (pageState.kind === "loading") {
      return (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" />
        </div>
      );
    }

    if (pageState.kind === "not_found") {
      return (
        <Result
          status="404"
          title={t("nfc_scan.not_found_title")}
          subTitle={t("nfc_scan.not_found_subtitle")}
        />
      );
    }

    if (pageState.kind === "error") {
      return (
        <Result
          status="error"
          title={t("nfc_scan.error_title")}
          subTitle={pageState.message}
          extra={
            <Button onClick={fetchBox}>{t("nfc_scan.retry")}</Button>
          }
        />
      );
    }

    if (pageState.kind === "activated") {
      const { box } = pageState;
      return (
        <Result
          icon={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
          title={t("nfc_scan.activation_success")}
          subTitle={
            box.spool
              ? `${t("nfc_scan.assigned_spool")}: #${box.spool.id}`
              : undefined
          }
          extra={
            <Space direction="vertical" style={{ width: "100%" }}>
              <Button onClick={() => setPageState({ kind: "assigned", box })}>
                {t("nfc_scan.back_to_box")}
              </Button>
            </Space>
          }
        />
      );
    }

    if (pageState.kind === "activate_error") {
      const { box, message } = pageState;
      return (
        <Result
          icon={<CloseCircleOutlined style={{ color: "#ff4d4f" }} />}
          title={t("nfc_scan.activation_failed")}
          subTitle={message}
          extra={
            <Button onClick={() => setPageState({ kind: "assigned", box })}>
              {t("nfc_scan.back_to_box")}
            </Button>
          }
        />
      );
    }

    const box = pageState.box;

    if (pageState.kind === "empty") {
      return (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px" }}>
          <Title level={3}>{box.name}</Title>
          <Alert
            type="info"
            showIcon
            message={t("nfc_scan.empty_box")}
            style={{ marginBottom: 24 }}
          />
          <Space direction="vertical" style={{ width: "100%" }}>
            <Button
              type="primary"
              block
              icon={<SwapOutlined />}
              onClick={() => setAssignModalOpen(true)}
            >
              {t("nfc_scan.assign_spool")}
            </Button>
            <Link to={`${getBasePath()}/spool/create`}>
              <Button block icon={<PlusOutlined />}>
                {t("nfc_scan.create_new_spool")}
              </Button>
            </Link>
          </Space>
        </div>
      );
    }

    if (pageState.kind === "assigned" || pageState.kind === "activating") {
      const isActivating = pageState.kind === "activating";
      const spool = box.spool!;
      const isArchived = spool.archived;

      return (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px" }}>
          <Title level={3}>{box.name}</Title>
          <Alert
            type={isArchived ? "warning" : "success"}
            showIcon
            message={
              isArchived
                ? t("nfc_scan.archived_spool_warning")
                : t("nfc_scan.assigned_spool")
            }
            description={
              <Text>
                #{spool.id}
                {spool.filament?.name ? ` — ${spool.filament.name}` : ""}
                {spool.filament?.material ? ` (${spool.filament.material})` : ""}
                {spool.location ? ` · ${spool.location}` : ""}
              </Text>
            }
            style={{ marginBottom: 24 }}
          />
          <Space direction="vertical" style={{ width: "100%" }}>
            {!isArchived && (
              <Button
                type="primary"
                block
                icon={<ThunderboltOutlined />}
                loading={isActivating}
                onClick={() => handleActivate(box)}
              >
                {t("nfc_scan.activate_in_klipper")}
              </Button>
            )}
            {isArchived && (
              <Alert type="error" message={t("nfc_scan.archived_cannot_activate")} />
            )}
            <Button
              block
              icon={<SwapOutlined />}
              onClick={() => setAssignModalOpen(true)}
            >
              {t("nfc_scan.assign_different_spool")}
            </Button>
            <Button
              block
              danger
              loading={isClearing}
              onClick={() => handleClear(box)}
            >
              {t("nfc_scan.clear_box")}
            </Button>
            <Link to={`${getBasePath()}/spool/create`}>
              <Button block icon={<PlusOutlined />}>
                {t("nfc_scan.create_new_spool")}
              </Button>
            </Link>
          </Space>
        </div>
      );
    }

    return null;
  };

  const currentBox =
    "box" in pageState ? pageState.box : null;

  return (
    <>
      {renderContent()}

      <Modal
        title={t("nfc_scan.assign_spool")}
        open={assignModalOpen}
        onCancel={() => {
          setAssignModalOpen(false);
          setSelectedSpoolId(null);
          setSpoolSearch("");
        }}
        onOk={handleAssign}
        confirmLoading={isAssigning}
        okButtonProps={{ disabled: selectedSpoolId === null }}
        okText={t("buttons.save")}
        cancelText={t("buttons.cancel")}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input.Search
            placeholder={t("nfc_scan.search_spools")}
            value={spoolSearch}
            onChange={(e) => setSpoolSearch(e.target.value)}
            allowClear
          />
          <Select
            showSearch={false}
            style={{ width: "100%" }}
            placeholder={t("nfc_scan.select_spool")}
            loading={spoolQuery.isLoading}
            value={selectedSpoolId}
            onChange={(val) => setSelectedSpoolId(val)}
            options={filteredSpools.map((s) => ({
              value: s.id,
              label: spoolLabel(s),
            }))}
            notFoundContent={
              spoolQuery.isLoading ? <Spin size="small" /> : t("nfc_scan.no_spools_found")
            }
          />
        </Space>
      </Modal>
    </>
  );
};

export default NfcBoxScanPage;
