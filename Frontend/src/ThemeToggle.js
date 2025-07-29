import React, { useContext } from "react";
import { ThemeContext } from "./ThemeContext";
import { IconButton, Tooltip } from "@mui/material";
import Brightness4Icon from "@mui/icons-material/Brightness4"; // Dark mode icon
import Brightness7Icon from "@mui/icons-material/Brightness7"; // Light mode icon

const ThemeToggle = () => {
  const { themeMode, toggleTheme } = useContext(ThemeContext);

  return (
    <Tooltip title={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}>
      <IconButton
        onClick={toggleTheme}
        color="inherit"
        sx={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 1200,
          backgroundColor: themeMode === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)",
          "&:hover": {
            backgroundColor: themeMode === "dark" ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)",
          },
        }}
      >
        {themeMode === "light" ? <Brightness4Icon /> : <Brightness7Icon />}
      </IconButton>
    </Tooltip>
  );
};

export default ThemeToggle;