import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { List, useTable } from "@refinedev/antd";
import { useCreate, useDelete, useTranslate, useUpdate } from "@refinedev/core";
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tooltip,
  Typography,
  message,
} from "antd";
import TextArea from "antd/es/input/TextArea";
import { useState } from "react";
import { getNfcBoxUrl } from "./functions";
import { INfcBox } from "./model";

const { Text } = Typography;

export const NfcBoxList = () => {
  const t = useTranslate();
  const [messageApi, contextHolder] = message.useMessage();

  const { tableProps } = useTable<INfcBox>({
    resource: "nfc-box",
    syncWithLocation: false,
    pagination: { mode: "off" },
    sorters: { mode: "off" },
    filters: { mode: "off" },
  });

  const { mutate: createBox } = useCreate<INfcBox>();
  const { mutate: updateBox } = useUpdate<INfcBox>();
  const { mutate: deleteBox } = useDelete();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<INfcBox | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const handleCreate = (values: { name: string; comment?: string }) => {
    setIsSaving(true);
    createBox(
      { resource: "nfc-box", values },
      {
        onSuccess: () => {
          createForm.resetFields();
          setCreateModalOpen(false);
          setIsSaving(false);
        },
        onError: () => setIsSaving(false),
      },
    );
  };

  const handleEdit = (values: { name: string; comment?: string }) => {
    if (!editingBox) return;
    setIsSaving(true);
    updateBox(
      { resource: "nfc-box", id: editingBox.id, values },
      {
        onSuccess: () => {
          editForm.resetFields();
          setEditModalOpen(false);
          setEditingBox(null);
          setIsSaving(false);
        },
        onError: () => setIsSaving(false),
      },
    );
  };

  const openEdit = (box: INfcBox) => {
    setEditingBox(box);
    editForm.setFieldsValue({ name: box.name, comment: box.comment });
    setEditModalOpen(true);
  };

  const handleCopyUrl = (box: INfcBox) => {
    const url = getNfcBoxUrl(box);
    navigator.clipboard.writeText(url).then(
      () => messageApi.success(t("nfc_boxes.copied")),
      () => messageApi.error(t("nfc_boxes.copy_failed")),
    );
  };

  return (
    <>
      {contextHolder}
      <List
        title={t("nfc_boxes.title")}
        headerButtons={({ defaultButtons }) => (
          <>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              {t("nfc_boxes.create")}
            </Button>
            {defaultButtons}
          </>
        )}
      >
        <Table {...tableProps} rowKey="id" tableLayout="auto" scroll={{ x: "max-content" }}>
          <Table.Column dataIndex="id" title={t("nfc_boxes.fields.id")} width={70} />
          <Table.Column dataIndex="name" title={t("nfc_boxes.fields.name")} />
          <Table.Column
            dataIndex="token"
            title={t("nfc_boxes.fields.nfc_url")}
            render={(_value, record: INfcBox) => (
              <Space>
                <Text code style={{ fontSize: 12 }}>
                  {getNfcBoxUrl(record)}
                </Text>
                <Tooltip title={t("nfc_boxes.copy_url")}>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyUrl(record)}
                  />
                </Tooltip>
              </Space>
            )}
          />
          <Table.Column
            dataIndex="spool"
            title={t("nfc_boxes.fields.assigned_spool")}
            render={(spool: INfcBox["spool"]) =>
              spool ? (
                <Text>
                  #{spool.id} — {spool.filament.name ?? spool.filament.material}
                </Text>
              ) : (
                <Text type="secondary">{t("nfc_boxes.empty_spool")}</Text>
              )
            }
          />
          <Table.Column dataIndex="comment" title={t("nfc_boxes.fields.comment")} />
          <Table.Column
            title={t("table.actions")}
            render={(_value, record: INfcBox) => (
              <Space>
                <Tooltip title={t("buttons.edit")}>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                </Tooltip>
                <Popconfirm
                  title={t("nfc_boxes.delete_confirm")}
                  description={t("nfc_boxes.delete_confirm_description", { name: record.name })}
                  onConfirm={() => deleteBox({ resource: "nfc-box", id: record.id })}
                  okText={t("buttons.delete")}
                  cancelText={t("buttons.cancel")}
                  okButtonProps={{ danger: true }}
                >
                  <Tooltip title={t("buttons.delete")}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              </Space>
            )}
          />
        </Table>
      </List>

      {/* Create Modal */}
      <Modal
        title={t("nfc_boxes.create")}
        open={createModalOpen}
        onCancel={() => {
          createForm.resetFields();
          setCreateModalOpen(false);
        }}
        onOk={() => createForm.submit()}
        confirmLoading={isSaving}
        okText={t("buttons.save")}
        cancelText={t("buttons.cancel")}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            label={t("nfc_boxes.fields.name")}
            name="name"
            rules={[{ required: true }, { max: 64 }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item label={t("nfc_boxes.fields.comment")} name="comment" rules={[{ max: 1024 }]}>
            <TextArea rows={3} maxLength={1024} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title={t("nfc_boxes.edit")}
        open={editModalOpen}
        onCancel={() => {
          editForm.resetFields();
          setEditModalOpen(false);
          setEditingBox(null);
        }}
        onOk={() => editForm.submit()}
        confirmLoading={isSaving}
        okText={t("buttons.save")}
        cancelText={t("buttons.cancel")}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item
            label={t("nfc_boxes.fields.name")}
            name="name"
            rules={[{ required: true }, { max: 64 }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item label={t("nfc_boxes.fields.comment")} name="comment" rules={[{ max: 1024 }]}>
            <TextArea rows={3} maxLength={1024} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default NfcBoxList;
