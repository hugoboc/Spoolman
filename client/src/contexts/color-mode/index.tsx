import { ConfigProvider, theme } from "antd";
import { createContext, PropsWithChildren, useEffect, useState } from "react";

type ColorModeContextType = {
  mode: string;
  setMode: (mode: string) => void;
};

export const ColorModeContext = createContext<ColorModeContextType>({} as ColorModeContextType);

export const ColorModeContextProvider = ({ children }: PropsWithChildren) => {
  const colorModeFromLocalStorage = localStorage.getItem("colorMode");
  const isSystemPreferenceDark = window?.matchMedia("(prefers-color-scheme: dark)").matches;

  const systemPreference = isSystemPreferenceDark ? "dark" : "light";
  const [mode, setMode] = useState(colorModeFromLocalStorage || systemPreference);

  useEffect(() => {
    window.localStorage.setItem("colorMode", mode);
  }, [mode]);

  const setColorMode = () => {
    if (mode === "light") {
      setMode("dark");
    } else {
      setMode("light");
    }
  };

  const { darkAlgorithm, defaultAlgorithm } = theme;

  return (
    <ColorModeContext.Provider
      value={{
        setMode: setColorMode,
        mode,
      }}
    >
      <ConfigProvider
        // you can change the theme colors here. example: ...RefineThemes.Magenta,
        theme={{
          cssVar: true,
          algorithm: mode === "light" ? defaultAlgorithm : darkAlgorithm,
          token: {
            colorPrimary: "#dc7734",
            colorInfo: "#dc7734",
            colorLink: "#dc7734",
            colorBgLayout: mode === "light" ? "#f6f8fb" : "#111827",
            colorBgContainer: mode === "light" ? "#ffffff" : "#172033",
            colorBgElevated: mode === "light" ? "#ffffff" : "#1f2937",
            colorText: mode === "light" ? "#111827" : "#f8fafc",
            colorTextSecondary: mode === "light" ? "#667085" : "#cbd5e1",
            colorBorder: mode === "light" ? "#e5e7eb" : "#334155",
            colorBorderSecondary: mode === "light" ? "#eef0f4" : "#243244",
            borderRadius: 8,
            borderRadiusLG: 10,
            borderRadiusSM: 6,
            controlHeight: 42,
            controlHeightSM: 34,
            controlHeightLG: 48,
            boxShadowSecondary:
              mode === "light"
                ? "0 12px 30px rgba(15, 23, 42, 0.06)"
                : "0 16px 36px rgba(0, 0, 0, 0.28)",
            fontFamily:
              "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
          },
          components: {
            Button: {
              defaultShadow: "none",
              primaryShadow: "0 8px 18px rgba(220, 119, 52, 0.28)",
            },
            Input: {
              activeBorderColor: "#dc7734",
              hoverBorderColor: "#dc7734",
            },
            Layout: {
              bodyBg: mode === "light" ? "#f6f8fb" : "#111827",
              footerBg: mode === "light" ? "#f6f8fb" : "#111827",
              headerBg: mode === "light" ? "#f6f8fb" : "#111827",
              siderBg: mode === "light" ? "#ffffff" : "#172033",
              triggerBg: mode === "light" ? "#ffffff" : "#172033",
              triggerColor: mode === "light" ? "#667085" : "#cbd5e1",
            },
            Menu: {
              itemBg: "transparent",
              itemBorderRadius: 8,
              itemColor: mode === "light" ? "#344054" : "#dbe4f0",
              itemHeight: 46,
              itemHoverBg: mode === "light" ? "#fff4ec" : "#33251e",
              itemHoverColor: "#dc7734",
              itemMarginBlock: 4,
              itemMarginInline: 10,
              itemSelectedBg: mode === "light" ? "#fff0e6" : "#3a261a",
              itemSelectedColor: "#dc7734",
            },
            Pagination: {
              itemActiveBg: mode === "light" ? "#ffffff" : "#172033",
            },
            Table: {
              borderColor: mode === "light" ? "#edf0f4" : "#263244",
              cellPaddingBlock: 14,
              cellPaddingInline: 18,
              headerBg: mode === "light" ? "#ffffff" : "#172033",
              headerColor: mode === "light" ? "#475467" : "#cbd5e1",
              headerSplitColor: "transparent",
              rowHoverBg: mode === "light" ? "#fff8f2" : "#1d293b",
            },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ColorModeContext.Provider>
  );
};
