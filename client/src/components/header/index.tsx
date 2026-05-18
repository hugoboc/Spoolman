import { DownOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import type { RefineThemedLayoutHeaderProps } from "@refinedev/antd";
import { useGetLocale, useSetLocale } from "@refinedev/core";
import { Layout as AntdLayout, Button, Dropdown, MenuProps, Space, theme } from "antd";
import React, { useContext } from "react";
import { ColorModeContext } from "../../contexts/color-mode";

import { languages } from "../../i18n";
import QRCodeScannerModal from "../qrCodeScanner";

const { useToken } = theme;

export const Header = ({ sticky }: RefineThemedLayoutHeaderProps) => {
  const { token } = useToken();
  const locale = useGetLocale();
  const changeLanguage = useSetLocale();
  const { mode, setMode } = useContext(ColorModeContext);

  const currentLocale = locale();

  const menuItems: MenuProps["items"] = [...(Object.keys(languages) || [])].sort().map((lang: string) => ({
    key: lang,
    onClick: () => changeLanguage(lang),
    label: languages[lang].name,
  }));

  const headerStyles: React.CSSProperties = {
    backgroundColor: token.colorBgElevated,
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: "0px 24px",
    height: "64px",
  };

  if (sticky) {
    headerStyles.position = "sticky";
    headerStyles.top = 0;
    headerStyles.zIndex = 1;
  }

  return (
    <AntdLayout.Header className="spoolman-header" style={headerStyles}>
      <Space size={12} className="spoolman-header-controls">
        <Dropdown
          menu={{
            items: menuItems,
            selectedKeys: currentLocale ? [currentLocale] : [],
          }}
        >
          <Button type="text" className="spoolman-language-button">
            <Space>
              {languages[currentLocale ?? "en"].name}
              <DownOutlined />
            </Space>
          </Button>
        </Dropdown>
        <Button
          shape="circle"
          className="spoolman-theme-button"
          icon={mode === "light" ? <SunOutlined /> : <MoonOutlined />}
          title={mode === "light" ? "Switch to dark mode" : "Switch to light mode"}
          aria-label={mode === "light" ? "Switch to dark mode" : "Switch to light mode"}
          onClick={() => setMode(mode === "light" ? "dark" : "light")}
        />
        <QRCodeScannerModal />
      </Space>
    </AntdLayout.Header>
  );
};
