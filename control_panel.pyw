#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ScreenSense Control Panel  -  desktop launcher and AI dashboard.
Run:  python control_panel.pyw   (or double-click the .bat launcher)
"""

import tkinter as tk
from tkinter import ttk, messagebox
import threading, time, json, socket, subprocess, sys, os, re, urllib.request, webbrowser

# ── Paths ──────────────────────────────────────────────────────────────────
BASE     = os.path.dirname(os.path.abspath(__file__))
BACKEND  = os.path.join(BASE, "backend")
FRONTEND = os.path.join(BASE, "screensense-app")
VENV_PY  = os.path.join(BACKEND, "venv", "Scripts", "python.exe")
ML_DIR   = os.path.join(BACKEND, "data", "models")
BACKEND_PORT = 8000

# ── Palette ────────────────────────────────────────────────────────────────
BG    = "#0f1a2e"
CARD  = "#1a2a40"
CARD2 = "#213050"
BDR   = "#2c4060"
VIO   = "#7c6cff"
BLU   = "#4f9fff"
GRN   = "#18c87a"
YLW   = "#f2a321"
RED   = "#ff5c7a"
TXT   = "#ddeeff"
MUT   = "#6a8ab0"
SUB   = "#3a526a"
WH    = "#ffffff"

F  = "Segoe UI"
FC = "Consolas"


# ══════════════════════════════════════════════════════════════════════════
# Widget helpers
# ══════════════════════════════════════════════════════════════════════════

def _lighten(hex_color, amount=22):
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2],16), int(h[2:4],16), int(h[4:6],16)
    return "#{:02x}{:02x}{:02x}".format(min(r+amount,255),min(g+amount,255),min(b+amount,255))

def card(parent, pad=1, **kw):
    outer = tk.Frame(parent, bg=BDR, **kw)
    inner = tk.Frame(outer, bg=CARD)
    inner.pack(fill=tk.BOTH, expand=True, padx=pad, pady=pad)
    return outer, inner

def section_label(parent, text, bg=CARD):
    tk.Label(parent, text=text.upper(), fg=SUB, bg=bg,
             font=(F, 8, "bold"), anchor="w").pack(fill=tk.X, padx=12, pady=(10,4))
    tk.Frame(parent, bg=BDR, height=1).pack(fill=tk.X, padx=12)

def solid_btn(parent, text, cmd, color=VIO, width=16, pady=6):
    b = tk.Button(parent, text=text, command=cmd, bg=color,
                  fg=WH, activebackground=_lighten(color), activeforeground=WH,
                  relief=tk.FLAT, bd=0, font=(F, 10, "bold"),
                  cursor="hand2", width=width, pady=pady)
    b.bind("<Enter>", lambda e: b.config(bg=_lighten(color)))
    b.bind("<Leave>", lambda e: b.config(bg=color))
    return b

def ghost_btn(parent, text, cmd, width=16):
    b = tk.Button(parent, text=text, command=cmd, bg=CARD2,
                  fg=MUT, activebackground=BDR, activeforeground=TXT,
                  relief=tk.FLAT, bd=0, font=(F, 10),
                  cursor="hand2", width=width, pady=5)
    return b

def lbl(parent, text, fg=MUT, bg=CARD, size=10, bold=False, anchor="w"):
    return tk.Label(parent, text=text, fg=fg, bg=bg,
                    font=(F, size, "bold" if bold else "normal"), anchor=anchor)


def _free_port(port: int):
    """Kill any process occupying *port* on Windows so Expo starts cleanly."""
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                parts = line.split()
                pid = int(parts[-1])
                if pid > 4:
                    subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                                   capture_output=True, timeout=5)
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════
# Canvas charts
# ══════════════════════════════════════════════════════════════════════════

class LineChart(tk.Canvas):
    def __init__(self, parent, h=130, **kw):
        super().__init__(parent, bg=CARD2, highlightthickness=0, height=h, **kw)
        self._s1, self._s2 = [], []
        self.bind("<Configure>", lambda e: self._draw())

    def set_data(self, s1, s2=None):
        self._s1 = s1 or []
        self._s2 = s2 or []
        self.after(0, self._draw)

    def _draw(self):
        self.delete("all")
        w = self.winfo_width() or 300
        h = self.winfo_height() or 130
        pad_l, pad_r, pad_t, pad_b = 38, 10, 10, 22
        self.create_line(pad_l, pad_t, pad_l, h-pad_b, fill=BDR, width=1)
        self.create_line(pad_l, h-pad_b, w-pad_r, h-pad_b, fill=BDR, width=1)

        def _series(data, color, label):
            if len(data) < 2: return
            mn, mx = min(data), max(data)
            rng = mx-mn if mx != mn else 0.001
            n   = len(data)
            W   = w - pad_l - pad_r
            H   = h - pad_t - pad_b
            xs  = [pad_l + i/(n-1)*W for i in range(n)]
            ys  = [(h-pad_b) - (v-mn)/rng*H for v in data]
            pts = []
            for x,y in zip(xs,ys): pts += [x,y]
            self.create_line(*pts, fill=color, width=2, smooth=True)
            for x,y in zip(xs,ys):
                self.create_oval(x-3,y-3,x+3,y+3, fill=color, outline=color)
            for v in [mn, (mn+mx)/2, mx]:
                yp = (h-pad_b) - (v-mn)/rng*H
                self.create_text(pad_l-4, yp, text=f"{v:.3f}",
                                 fill=SUB, font=(FC,7), anchor="e")

        _series(self._s1, VIO, "New F1")
        _series(self._s2, BLU, "Old F1")

        self.create_rectangle(w-90, pad_t, w-pad_r, pad_t+28, fill=CARD, outline=BDR)
        self.create_line(w-86, pad_t+9,  w-72, pad_t+9,  fill=VIO, width=2)
        self.create_line(w-86, pad_t+20, w-72, pad_t+20, fill=BLU, width=2)
        self.create_text(w-70, pad_t+9,  text="Current", fill=MUT, font=(FC,7), anchor="w")
        self.create_text(w-70, pad_t+20, text="Previous", fill=MUT, font=(FC,7), anchor="w")

        if self._s1:
            n = len(self._s1)
            for i in range(n):
                x = pad_l + i/(n-1)*(w-pad_l-pad_r) if n>1 else pad_l
                if n<=8 or i%(max(1,n//6))==0:
                    self.create_text(x, h-pad_b+8, text=str(i+1),
                                     fill=SUB, font=(FC,7))


class BarChart(tk.Canvas):
    def __init__(self, parent, h=160, **kw):
        super().__init__(parent, bg=CARD2, highlightthickness=0, height=h, **kw)
        self._data = {}
        self.bind("<Configure>", lambda e: self._draw())

    def set_data(self, data):
        self._data = data
        self.after(0, self._draw)

    def _draw(self):
        self.delete("all")
        w = self.winfo_width() or 340
        h = self.winfo_height() or 160
        if not self._data: return
        items  = list(self._data.items())[:8]
        n      = len(items)
        mx     = max(v for _,v in items) or 1
        colors = [VIO, BLU, GRN, YLW, RED, VIO, BLU, GRN]
        lpad, rpad = 110, 60
        bar_h = max(10, (h-16)//n - 5)

        for i, ((label, val), col) in enumerate(zip(items, colors)):
            y  = 8 + i*(bar_h+5)
            bw = int((val/mx)*(w-lpad-rpad))
            self.create_rectangle(lpad, y, lpad+(w-lpad-rpad), y+bar_h,
                                  fill="", outline=BDR, width=1)
            self.create_rectangle(lpad, y, lpad+bw, y+bar_h,
                                  fill=col, outline="", width=0)
            self.create_text(lpad-6, y+bar_h//2, text=label,
                             fill=MUT, font=(F,9), anchor="e")
            self.create_text(lpad+bw+6, y+bar_h//2,
                             text=f"{val:.1f}%", fill=TXT,
                             font=(FC,9,"bold"), anchor="w")


class DonutChart(tk.Canvas):
    def __init__(self, parent, size=130, **kw):
        super().__init__(parent, bg=CARD, highlightthickness=0,
                         width=size, height=size, **kw)
        self._values = [1,1,1]
        self._colors = [GRN, YLW, RED]
        self._s      = size
        self.bind("<Configure>", lambda e: self._draw())

    def set_data(self, values):
        self._values = values
        self.after(0, self._draw)

    def _draw(self):
        self.delete("all")
        s = self._s
        m = 8
        total = sum(self._values) or 1
        start = -90.0
        thick = 18
        for v, col in zip(self._values, self._colors):
            ext = (v/total)*360
            self.create_arc(m, m, s-m, s-m, start=start, extent=ext,
                            fill=col, outline=BG, width=2, style=tk.ARC)
            self.create_arc(m+thick, m+thick, s-m-thick, s-m-thick,
                            start=start, extent=ext,
                            fill=col, outline=BG, width=1, style=tk.ARC)
            start += ext
        c = s//2
        r = s//2 - m - thick - 2
        self.create_oval(c-r,c-r,c+r,c+r, fill=CARD, outline=CARD)
        self.create_text(c, c-7, text=str(sum(self._values)),
                         fill=TXT, font=(F,13,"bold"))
        self.create_text(c, c+8, text="entries", fill=SUB, font=(F,8))


# ══════════════════════════════════════════════════════════════════════════
# Main application
# ══════════════════════════════════════════════════════════════════════════

class ControlPanel:

    def __init__(self):
        self.root      = tk.Tk()
        self.procs     = {}
        self.launching = False
        self.retrain_hist = []
        self._expo_url      = ""
        self._web_url       = ""   # https:// version of Expo tunnel for browser
        self._backend_url   = ""   # public backend URL (localtunnel or LAN)
        self._selected_user = None

        self._setup_window()
        self._set_dark_titlebar()
        self._build_ui()
        self._draw_default_charts()
        self._poll_loop()

    # ── Window ────────────────────────────────────────────────────────────

    def _setup_window(self):
        self.root.title("ScreenSense  -  Control Panel")
        self.root.configure(bg=BG)
        self.root.geometry("1280x800")
        self.root.minsize(1100, 700)

    def _set_dark_titlebar(self):
        try:
            import ctypes
            self.root.update()
            hwnd = ctypes.windll.user32.GetParent(self.root.winfo_id())
            ctypes.windll.dwmapi.DwmSetWindowAttribute(
                hwnd, 20, ctypes.byref(ctypes.c_int(1)), ctypes.sizeof(ctypes.c_int))
        except Exception:
            pass

    # ── Top-level layout ──────────────────────────────────────────────────

    def _build_ui(self):
        self._build_topbar()
        body = tk.Frame(self.root, bg=BG)
        body.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0,10))
        body.columnconfigure(0, minsize=272, weight=0)
        body.columnconfigure(1, weight=1)
        body.rowconfigure(0, weight=1)
        self._build_left(body)
        self._build_right_tabs(body)

    # ── Topbar ────────────────────────────────────────────────────────────

    def _build_topbar(self):
        bar = tk.Frame(self.root, bg="#080e1a", height=48)
        bar.pack(fill=tk.X)
        bar.pack_propagate(False)
        tk.Frame(bar, bg=VIO, width=4).pack(side=tk.LEFT, fill=tk.Y)
        tk.Label(bar, text="ScreenSense", fg=TXT, bg="#080e1a",
                 font=(F,14,"bold")).pack(side=tk.LEFT, padx=(14,4), pady=12)
        tk.Label(bar, text="Control Panel", fg=MUT, bg="#080e1a",
                 font=(F,12)).pack(side=tk.LEFT, pady=12)

        self._clock_lbl = tk.Label(bar, text="", fg=SUB, bg="#080e1a", font=(FC,10))
        self._clock_lbl.pack(side=tk.RIGHT, padx=14)

        self._global_lbl = tk.Label(bar, text="Services Offline", fg=MUT,
                                    bg="#080e1a", font=(F,10))
        self._global_lbl.pack(side=tk.RIGHT, padx=(0,4))

        self._global_dot = tk.Canvas(bar, width=10, height=10, bg="#080e1a",
                                     highlightthickness=0)
        self._global_dot.pack(side=tk.RIGHT, padx=(12,0), pady=19)
        self._global_dot.create_oval(1,1,9,9, fill=SUB, outline=SUB, tags="dot")
        self._update_clock()

    def _update_clock(self):
        self._clock_lbl.config(text=time.strftime("%H:%M:%S"))
        self.root.after(1000, self._update_clock)

    # ══════════════════════════════════════════════════════════════════════
    # LEFT panel
    # ══════════════════════════════════════════════════════════════════════

    def _build_left(self, parent):
        col = tk.Frame(parent, bg=BG)
        col.grid(row=0, column=0, sticky="nsew", padx=(0,8))
        col.rowconfigure(1, weight=1)
        self._build_launch_card(col)
        self._build_console_card(col)
        self._build_mobile_card(col)

    def _build_launch_card(self, parent):
        o, c = card(parent)
        o.grid(row=0, column=0, sticky="ew", pady=(0,8))
        section_label(c, "Launch Control")

        bf = tk.Frame(c, bg=CARD)
        bf.pack(fill=tk.X, padx=12, pady=8)
        self._launch_btn = solid_btn(bf, "Start ScreenSense",
                                     self._handle_launch, color=VIO, width=20)
        self._launch_btn.pack(fill=tk.X, pady=(0,6))
        ghost_btn(bf, "Stop All Services", self._stop_all, width=20).pack(fill=tk.X)

        pb_f = tk.Frame(c, bg=CARD)
        pb_f.pack(fill=tk.X, padx=12, pady=(0,8))
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Dark.Horizontal.TProgressbar",
                        background=VIO, troughcolor=CARD2,
                        bordercolor=CARD2, lightcolor=VIO, darkcolor=VIO)
        self._progress = ttk.Progressbar(pb_f, style="Dark.Horizontal.TProgressbar",
                                         mode="determinate", length=248)
        self._progress.pack(fill=tk.X)

        chips = tk.Frame(c, bg=CARD)
        chips.pack(fill=tk.X, padx=12, pady=(0,10))
        for i in range(3): chips.columnconfigure(i, weight=1)
        self._chip_backend = self._make_chip(chips, "Backend", 0)
        self._chip_expo    = self._make_chip(chips, "Expo",    1)
        self._chip_db      = self._make_chip(chips, "Database",2)

    def _make_chip(self, parent, text, col):
        f = tk.Frame(parent, bg=CARD2)
        f.grid(row=0, column=col, sticky="ew",
               padx=(0 if col==0 else 3, 0), pady=3)
        d = tk.Canvas(f, width=8, height=8, bg=CARD2, highlightthickness=0)
        d.pack(pady=(7,2))
        d.create_oval(0,0,8,8, fill=SUB, outline=SUB, tags="dot")
        tk.Label(f, text=text, fg=SUB, bg=CARD2, font=(F,8)).pack()
        v = tk.Label(f, text="Off", fg=SUB, bg=CARD2, font=(F,9,"bold"))
        v.pack(pady=(0,6))
        return (d, v)

    def _build_console_card(self, parent):
        o, c = card(parent)
        o.grid(row=1, column=0, sticky="nsew", pady=(0,8))
        section_label(c, "Console Output")

        txt_frame = tk.Frame(c, bg=CARD)
        txt_frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=(4,0))

        self._console = tk.Text(txt_frame, bg="#080e1a", fg=MUT,
                                font=(FC,9), relief=tk.FLAT,
                                wrap=tk.WORD, state=tk.DISABLED,
                                padx=8, pady=6)
        self._console.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        sb = tk.Scrollbar(txt_frame, bg=BDR, troughcolor=CARD,
                          command=self._console.yview)
        sb.pack(side=tk.RIGHT, fill=tk.Y)
        self._console.config(yscrollcommand=sb.set)

        self._console.tag_config("info",    foreground=MUT)
        self._console.tag_config("success", foreground=GRN)
        self._console.tag_config("warn",    foreground=YLW)
        self._console.tag_config("error",   foreground=RED)
        self._console.tag_config("ts",      foreground=SUB)

        ghost_btn(c, "Clear", self._clear_console, width=8).pack(
            anchor="e", padx=12, pady=6)

    def _build_mobile_card(self, parent):
        o, c = card(parent)
        o.grid(row=2, column=0, sticky="ew")
        section_label(c, "Mobile Access")

        row = tk.Frame(c, bg=CARD)
        row.pack(fill=tk.X, padx=12, pady=8)

        self._qr_canvas = tk.Canvas(row, width=90, height=90,
                                    bg=WH, highlightthickness=0)
        self._qr_canvas.pack(side=tk.LEFT, padx=(0,10))
        self._draw_qr_placeholder()

        info = tk.Frame(row, bg=CARD)
        info.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        lbl(info, "Scan with Expo Go to open on your phone", fg=MUT, size=9).pack(anchor="w")
        self._url_lbl = tk.Label(info, text="Waiting for Expo...",
                                 fg=VIO, bg=CARD, font=(F,8),
                                 wraplength=150, anchor="w", justify=tk.LEFT)
        self._url_lbl.pack(anchor="w", pady=(2,0))

        # Backend tunnel URL row
        lbl(info, "Backend API:", fg=SUB, size=8).pack(anchor="w", pady=(6,0))
        self._backend_url_lbl = tk.Label(info, text="Starting tunnel...",
                                         fg=GRN, bg=CARD, font=(F,8),
                                         wraplength=150, anchor="w", justify=tk.LEFT)
        self._backend_url_lbl.pack(anchor="w", pady=(0,6))

        self._browser_btn = solid_btn(info, "Open in Browser",
                  self._open_in_browser,
                  color=BLU, width=14, pady=4)
        self._browser_btn.pack(anchor="w")

    def _open_in_browser(self):
        """Open the web version — use tunnel URL when available, else localhost."""
        url = self._web_url if self._web_url else "http://localhost:8081"
        webbrowser.open(url, new=2)

    def _draw_qr_placeholder(self):
        c = self._qr_canvas
        c.delete("all")
        c.create_rectangle(0,0,90,90, fill="#f0f0f0", outline="")
        for x, y in [(3,3),(58,3),(3,58)]:
            c.create_rectangle(x,y,x+29,y+29, fill="#222", outline="")
            c.create_rectangle(x+4,y+4,x+25,y+25, fill="#f0f0f0", outline="")
            c.create_rectangle(x+8,y+8,x+21,y+21, fill="#222", outline="")
        c.create_text(45,45, text="Waiting\nfor\ntunnel", fill="#888",
                      font=(F,7), justify=tk.CENTER)

    def _update_qr(self, url):
        self._expo_url = url
        self._url_lbl.config(text=url)
        # Derive the HTTPS web URL from the tunnel (for browser access)
        if url.startswith("exp://"):
            https_url = url.replace("exp://", "https://", 1)
            self._web_url = https_url
        elif url.startswith("https://"):
            self._web_url = url
        try:
            import qrcode
            from PIL import ImageTk
            img = qrcode.make(url).resize((90, 90))
            self._qr_img = ImageTk.PhotoImage(img)
            self._qr_canvas.delete("all")
            self._qr_canvas.create_image(0, 0, image=self._qr_img, anchor="nw")
            self._log("QR code ready — scan with Expo Go from anywhere.", "success")
            return
        except ImportError:
            if not getattr(self, '_qr_installing', False):
                self._qr_installing = True
                self._log("Installing qrcode library (one-time)...", "warn")
                threading.Thread(target=self._install_qrcode_pkg, daemon=True).start()
        except Exception:
            pass
        c = self._qr_canvas
        c.delete("all")
        c.create_rectangle(0, 0, 90, 90, fill="#f0f0f0", outline="")
        for x, y in [(3, 3), (58, 3), (3, 58)]:
            c.create_rectangle(x, y, x+29, y+29, fill="#1a1a2e", outline="")
            c.create_rectangle(x+4, y+4, x+25, y+25, fill="#f0f0f0", outline="")
            c.create_rectangle(x+8, y+8, x+21, y+21, fill="#1a1a2e", outline="")
        c.create_text(45, 72, text="scan URL above", fill="#666",
                      font=(F, 6), justify=tk.CENTER)

    def _install_qrcode_pkg(self):
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "--quiet", "qrcode[pil]"],
                capture_output=True, timeout=90)
            self._qr_installing = False
            if self._expo_url:
                self.root.after(0, self._update_qr, self._expo_url)
        except Exception as e:
            self.root.after(0, self._log, f"qrcode install failed: {e}", "warn")
            self._qr_installing = False

    # ══════════════════════════════════════════════════════════════════════
    # RIGHT  –  tabbed area
    # ══════════════════════════════════════════════════════════════════════

    def _build_right_tabs(self, parent):
        right = tk.Frame(parent, bg=BG)
        right.grid(row=0, column=1, sticky="nsew")
        right.rowconfigure(0, weight=1)
        right.columnconfigure(0, weight=1)

        style = ttk.Style()
        style.theme_use("default")
        style.configure("Dark.TNotebook",
                        background=BG, borderwidth=0, tabmargins=0)
        style.configure("Dark.TNotebook.Tab",
                        background=CARD2, foreground=MUT,
                        font=(F,10), padding=(16,8), borderwidth=0)
        style.map("Dark.TNotebook.Tab",
                  background=[("selected", CARD), ("active", BDR)],
                  foreground=[("selected", TXT), ("active", TXT)])

        self._nb = ttk.Notebook(right, style="Dark.TNotebook")
        self._nb.grid(row=0, column=0, sticky="nsew")

        self._build_tab_overview()
        self._build_tab_training()
        self._build_tab_accounts()
        self._build_tab_guide()

    # ── Tab 1: Overview ───────────────────────────────────────────────────

    def _build_tab_overview(self):
        tab = tk.Frame(self._nb, bg=BG)
        tab.rowconfigure(1, weight=1)
        tab.columnconfigure(0, weight=3)
        tab.columnconfigure(1, weight=2)
        self._nb.add(tab, text="  Overview  ")

        mf_outer, mf = card(tab)
        mf_outer.grid(row=0, column=0, columnspan=2, sticky="ew",
                      pady=(8,8), padx=(0,0))
        section_label(mf, "Live AI Model Metrics")

        tiles = tk.Frame(mf, bg=CARD)
        tiles.pack(fill=tk.X, padx=12, pady=8)
        for i in range(6): tiles.columnconfigure(i, weight=1)

        metrics = [
            ("RF Accuracy", "77.5%",   VIO, "rf_acc"),
            ("RF F1 Score", "0.774",   BLU, "rf_f1"),
            ("LSTM MSE",    "0.438",   YLW, "lstm_mse"),
            ("BiLSTM",      "5-class", GRN, "bilstm"),
            ("Retrains",    "-",       VIO, "retrain_n"),
            ("Entries",     "-",       BLU, "entry_n"),
        ]
        self._metric_vars = {}
        for i, (title, val, col, key) in enumerate(metrics):
            f = tk.Frame(tiles, bg=CARD2)
            f.grid(row=0, column=i, padx=(0 if i==0 else 5,0), sticky="ew", pady=2)
            tk.Label(f, text=title, fg=SUB, bg=CARD2,
                     font=(F,8), wraplength=90).pack(pady=(8,2), padx=4)
            v = tk.Label(f, text=val, fg=col, bg=CARD2, font=(F,15,"bold"))
            v.pack(pady=(0,8))
            self._metric_vars[key] = v

        lo, lc = card(tab)
        lo.grid(row=1, column=0, sticky="nsew", pady=(0,8), padx=(0,8))
        section_label(lc, "F1 Score Learning Curve  (each retrain cycle)")
        self._f1_chart = LineChart(lc, h=150)
        self._f1_chart.pack(fill=tk.BOTH, expand=True, padx=8, pady=(4,8))
        lbl(lc, "Shows whether the model improves after each training run.",
            fg=SUB, size=8).pack(padx=12, pady=(0,6))

        ro, rc = card(tab)
        ro.grid(row=1, column=1, sticky="nsew", pady=(0,8))
        section_label(rc, "Stress Distribution  (all entries)")

        dc_row = tk.Frame(rc, bg=CARD)
        dc_row.pack(fill=tk.X, padx=12, pady=8)
        self._donut = DonutChart(dc_row, size=130)
        self._donut.pack(side=tk.LEFT, padx=(4,10))

        leg = tk.Frame(dc_row, bg=CARD)
        leg.pack(side=tk.LEFT, fill=tk.Y, pady=8)
        for txt, col in [("Low stress",  GRN),
                         ("Moderate",    YLW),
                         ("High stress", RED)]:
            r = tk.Frame(leg, bg=CARD)
            r.pack(fill=tk.X, pady=5)
            tk.Frame(r, bg=col, width=10, height=10).pack(side=tk.LEFT)
            tk.Label(r, text=f"  {txt}", fg=MUT, bg=CARD,
                     font=(F,9)).pack(side=tk.LEFT)

        lbl(rc, "Updated every 2 seconds from the live backend.",
            fg=SUB, size=8).pack(padx=12, pady=(0,8))

    # ── Tab 2: AI & Training ──────────────────────────────────────────────

    def _build_tab_training(self):
        tab = tk.Frame(self._nb, bg=BG)
        tab.rowconfigure(0, weight=1)
        tab.columnconfigure(0, weight=1)
        tab.columnconfigure(1, minsize=240, weight=0)
        self._nb.add(tab, text="  AI & Training  ")

        left = tk.Frame(tab, bg=BG)
        left.grid(row=0, column=0, sticky="nsew", padx=(0,8))
        left.rowconfigure(0, weight=2)
        left.rowconfigure(1, weight=3)

        right = tk.Frame(tab, bg=BG)
        right.grid(row=0, column=1, sticky="nsew")
        right.rowconfigure(1, weight=1)

        # SHAP chart
        so, sc = card(left)
        so.grid(row=0, column=0, sticky="nsew", pady=(8,8))
        section_label(sc, "SHAP Feature Importances  (what drives stress predictions)")
        lbl(sc, "The factors with the highest influence on each stress prediction score.",
            fg=SUB, size=8).pack(padx=12, pady=(4,2))
        self._shap_chart = BarChart(sc, h=175)
        self._shap_chart.pack(fill=tk.BOTH, expand=True, padx=8, pady=(0,8))

        # Training controls
        to_, tc = card(left)
        to_.grid(row=1, column=0, sticky="nsew", pady=(0,8))
        section_label(tc, "AI Model Training")

        # Status badge
        status_f = tk.Frame(tc, bg=CARD2)
        status_f.pack(fill=tk.X, padx=12, pady=(8,0))
        tk.Frame(status_f, bg=GRN, width=4).pack(side=tk.LEFT, fill=tk.Y)
        si = tk.Frame(status_f, bg=CARD2)
        si.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=8)
        tk.Label(si, text="Model Status: Production Ready",
                 fg=GRN, bg=CARD2, font=(F,9,"bold")).pack(anchor="w")
        tk.Label(si, text="Random Forest + LSTM + BiLSTM ensemble — pre-trained on clinical data.",
                 fg=MUT, bg=CARD2, font=(F,8)).pack(anchor="w", pady=(2,0))

        tk.Frame(tc, bg=BDR, height=1).pack(fill=tk.X, padx=12, pady=(8,6))

        cf = tk.Frame(tc, bg=CARD)
        cf.pack(fill=tk.X, padx=12, pady=(0,8))

        # Update AI Model button
        r1 = tk.Frame(cf, bg=CARD2)
        r1.pack(fill=tk.X, pady=(0,8))
        tk.Frame(r1, bg=VIO, width=4).pack(side=tk.LEFT, fill=tk.Y)
        r1i = tk.Frame(r1, bg=CARD2)
        r1i.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=8)
        tk.Label(r1i, text="Update AI Model",
                 fg=VIO, bg=CARD2, font=(F,9,"bold")).pack(anchor="w")
        tk.Label(r1i, text="Retrains on all existing check-in data to improve future predictions.",
                 fg=MUT, bg=CARD2, font=(F,8)).pack(anchor="w", pady=(2,6))
        solid_btn(r1i, "Update Now", self._retrain, color=VIO, width=14, pady=4).pack(anchor="w")

        # Add Test Data & Train button
        r2 = tk.Frame(cf, bg=CARD2)
        r2.pack(fill=tk.X, pady=(0,8))
        tk.Frame(r2, bg=GRN, width=4).pack(side=tk.LEFT, fill=tk.Y)
        r2i = tk.Frame(r2, bg=CARD2)
        r2i.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=8)
        tk.Label(r2i, text="Add Test Data & Train",
                 fg=GRN, bg=CARD2, font=(F,9,"bold")).pack(anchor="w")
        tk.Label(r2i, text="Seeds 200 realistic test entries then retrains the model (for demo use).",
                 fg=MUT, bg=CARD2, font=(F,8)).pack(anchor="w", pady=(2,6))
        solid_btn(r2i, "Run", self._seed_and_train, color=GRN, width=14, pady=4).pack(anchor="w")

        # Custom N cycles
        r3 = tk.Frame(cf, bg=CARD)
        r3.pack(fill=tk.X, pady=(0,6))
        tk.Label(r3, text="Run N training cycles:", fg=MUT, bg=CARD,
                 font=(F,9)).pack(side=tk.LEFT)
        self._cycle_var = tk.IntVar(value=5)
        tk.Spinbox(r3, from_=1, to=30, textvariable=self._cycle_var,
                   width=4, bg=CARD2, fg=TXT, font=(FC,10),
                   buttonbackground=BDR, relief=tk.FLAT).pack(side=tk.LEFT, padx=8)
        solid_btn(r3, "Run", self._run_n_cycles, color=SUB, width=6).pack(side=tk.LEFT)

        self._train_log = tk.Label(cf, text="Ready.", fg=MUT, bg=CARD2,
                                   font=(FC,9), anchor="w", padx=8, pady=5)
        self._train_log.pack(fill=tk.X)

        # Right side
        ro, rc2 = card(right)
        ro.grid(row=0, column=0, sticky="ew", pady=(8,8))
        section_label(rc2, "Quick Access")
        folders = [
            ("Backend / API",    BACKEND),
            ("ML Models",        ML_DIR),
            ("React Native App", FRONTEND),
            ("Project Root",     BASE),
        ]
        for name, path in folders:
            self._folder_btn(rc2, name, path)

        rro, rrc = card(right)
        rro.grid(row=1, column=0, sticky="nsew", pady=(0,8))
        section_label(rrc, "Recent Retrains")
        self._retrain_frame = tk.Frame(rrc, bg=CARD)
        self._retrain_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=6)
        tk.Label(self._retrain_frame, text="No retrain history yet.",
                 fg=SUB, bg=CARD, font=(F,9)).pack(pady=16)

    # ── Tab 3: Accounts ───────────────────────────────────────────────────

    def _build_tab_accounts(self):
        tab = tk.Frame(self._nb, bg=BG)
        tab.rowconfigure(1, weight=1)
        tab.columnconfigure(0, weight=2)
        tab.columnconfigure(1, weight=1)
        self._nb.add(tab, text="  Accounts  ")

        # Left: user list
        top_outer, top = card(tab)
        top_outer.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(8,8))
        section_label(top, "Registered Users")

        row = tk.Frame(top, bg=CARD)
        row.pack(fill=tk.X, padx=12, pady=(4,10))

        self._acc_count_var = tk.StringVar(value="—")
        tk.Label(row, textvariable=self._acc_count_var,
                 fg=VIO, bg=CARD, font=(F,18,"bold")).pack(side=tk.LEFT)
        tk.Label(row, text="  registered accounts",
                 fg=MUT, bg=CARD, font=(F,10)).pack(side=tk.LEFT, pady=(6,0))

        solid_btn(row, "  Refresh  ", lambda: threading.Thread(
            target=self._refresh_accounts, daemon=True).start(),
            color=VIO, width=10, pady=4).pack(side=tk.RIGHT, padx=4)

        tk.Label(top,
                 text="GDPR compliant — name, email, join date, check-in count only. No passwords, locations, or journal data.",
                 fg=SUB, bg=CARD, font=(F,8,"italic")
                 ).pack(anchor="w", padx=12, pady=(0,8))

        # Account list
        list_outer, list_card = card(tab)
        list_outer.grid(row=1, column=0, sticky="nsew", pady=(0,8), padx=(0,8))
        section_label(list_card, "Account Directory  (click a row to view details)")

        hdr = tk.Frame(list_card, bg=CARD2)
        hdr.pack(fill=tk.X, padx=12, pady=(4,0))
        for txt, w in [("Name",16),("Email",28),("Joined",10),("Last login",10),("Check-ins",9)]:
            tk.Label(hdr, text=txt, fg=SUB, bg=CARD2,
                     font=(F,8,"bold"), width=w, anchor="w"
                     ).pack(side=tk.LEFT, padx=4, pady=6)

        cv_frame = tk.Frame(list_card, bg=CARD)
        cv_frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0,10))

        self._acc_canvas = tk.Canvas(cv_frame, bg=CARD, highlightthickness=0)
        self._acc_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        sb = tk.Scrollbar(cv_frame, orient="vertical",
                          command=self._acc_canvas.yview)
        sb.pack(side=tk.RIGHT, fill=tk.Y)
        self._acc_canvas.configure(yscrollcommand=sb.set)

        self._acc_rows_frame = tk.Frame(self._acc_canvas, bg=CARD)
        self._acc_canvas.create_window((0,0), window=self._acc_rows_frame, anchor="nw")

        def _resize(e):
            self._acc_canvas.configure(scrollregion=self._acc_canvas.bbox("all"))
        self._acc_rows_frame.bind("<Configure>", _resize)

        self._acc_status_var = tk.StringVar(value="Press Refresh to load accounts.")
        tk.Label(list_card, textvariable=self._acc_status_var,
                 fg=SUB, bg=CARD, font=(F,8,"italic")
                 ).pack(anchor="w", padx=12, pady=(0,8))

        # Right: detail panel
        det_outer, det_card = card(tab)
        det_outer.grid(row=1, column=1, sticky="nsew", pady=(0,8))
        section_label(det_card, "Account Detail")
        self._det_frame = tk.Frame(det_card, bg=CARD)
        self._det_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=8)
        tk.Label(self._det_frame,
                 text="Click any account\nrow to view details.",
                 fg=SUB, bg=CARD, font=(F,9,"italic"),
                 justify=tk.CENTER).pack(expand=True)

        threading.Thread(target=self._refresh_accounts, daemon=True).start()

    def _refresh_accounts(self):
        try:
            data = self._api_get("/api/auth/users")
        except Exception as e:
            self.root.after(0, lambda:
                self._acc_status_var.set(f"Backend not reachable: {e}"))
            return

        users = data.get("users", [])
        total = data.get("total", len(users))

        def _render():
            for w in self._acc_rows_frame.winfo_children():
                w.destroy()

            self._acc_count_var.set(str(total))

            if not users:
                tk.Label(self._acc_rows_frame,
                         text="No accounts yet. Sign up in the app to add the first one.",
                         fg=SUB, bg=CARD, font=(F,9,"italic")
                         ).pack(anchor="w", padx=4, pady=8)
                self._acc_status_var.set("Loaded: 0 accounts.")
                return

            for i, u in enumerate(users):
                r_bg = CARD2 if i % 2 == 0 else CARD
                r = tk.Frame(self._acc_rows_frame, bg=r_bg, cursor="hand2")
                r.pack(fill=tk.X, pady=1)

                name   = (u.get("name")  or "—")[:22]
                email  = (u.get("email") or "—")[:34]
                joined = self._fmt_date(u.get("created_at",""))
                last   = self._fmt_date(u.get("last_login",""))
                count  = str(u.get("entry_count", 0))

                for txt, w in [(name,16),(email,28),(joined,10),(last,10),(count,9)]:
                    lx = tk.Label(r, text=txt, fg=TXT, bg=r_bg,
                             font=(F,9), width=w, anchor="w")
                    lx.pack(side=tk.LEFT, padx=4, pady=5)

                # Hover + click
                def _on(e, f=r, wdgts=r.winfo_children()):
                    f.config(bg=BDR)
                    for c in f.winfo_children(): c.config(bg=BDR)
                def _off(e, f=r, bg=r_bg):
                    f.config(bg=bg)
                    for c in f.winfo_children(): c.config(bg=bg)
                def _click(e, user=u):
                    self._show_account_detail(user)

                for widget in [r] + list(r.winfo_children()):
                    widget.bind("<Enter>", _on)
                    widget.bind("<Leave>", _off)
                    widget.bind("<Button-1>", _click)

            from datetime import datetime
            self._acc_status_var.set(
                f"Loaded {total} account{'s' if total != 1 else ''} "
                f"at {datetime.now().strftime('%H:%M:%S')}.")

        self.root.after(0, _render)

    def _fmt_date(self, iso):
        if not iso: return "—"
        try:
            from datetime import datetime
            return datetime.fromisoformat(iso).strftime("%d %b %y")
        except Exception:
            return iso[:10]

    def _show_account_detail(self, u):
        for w in self._det_frame.winfo_children():
            w.destroy()

        name  = u.get("name", "—")
        email = u.get("email", "—")
        arch  = (u.get("archetype") or "Not set").replace("_", " ").title()
        joined = self._fmt_date(u.get("created_at",""))
        last   = self._fmt_date(u.get("last_login",""))
        count  = str(u.get("entry_count", 0))

        tk.Label(self._det_frame, text=name[:20], fg=TXT, bg=CARD,
                 font=(F,12,"bold"), anchor="w").pack(fill=tk.X, pady=(0,2))
        tk.Label(self._det_frame, text=email, fg=MUT, bg=CARD,
                 font=(FC,8), anchor="w").pack(fill=tk.X, pady=(0,8))

        tk.Frame(self._det_frame, bg=BDR, height=1).pack(fill=tk.X, pady=(0,8))

        for label, val in [
            ("Profile", arch),
            ("Joined",  joined),
            ("Last login", last),
            ("Check-ins",  count),
        ]:
            row = tk.Frame(self._det_frame, bg=CARD)
            row.pack(fill=tk.X, pady=3)
            tk.Label(row, text=label, fg=SUB, bg=CARD,
                     font=(F,9), width=12, anchor="w").pack(side=tk.LEFT)
            tk.Label(row, text=val, fg=TXT, bg=CARD,
                     font=(F,9,"bold"), anchor="w").pack(side=tk.LEFT)

        tk.Frame(self._det_frame, bg=BDR, height=1).pack(fill=tk.X, pady=(8,8))

        tk.Label(self._det_frame,
                 text="GDPR Compliance",
                 fg=GRN, bg=CARD, font=(F,8,"bold"), anchor="w").pack(fill=tk.X)
        tk.Label(self._det_frame,
                 text="✓ No passwords stored\n✓ No location data shown\n✓ No journal content\n✓ Right to erasure available",
                 fg=MUT, bg=CARD, font=(F,8), anchor="w", justify=tk.LEFT,
                 wraplength=180).pack(fill=tk.X, pady=(4,0))

        tk.Frame(self._det_frame, bg=BDR, height=1).pack(fill=tk.X, pady=(10,8))

        tk.Label(self._det_frame,
                 text="Demo Actions",
                 fg=YLW, bg=CARD, font=(F,8,"bold"), anchor="w").pack(fill=tk.X)
        tk.Label(self._det_frame,
                 text=f"Seed data or simulate scenarios for {name.split()[0]}.",
                 fg=SUB, bg=CARD, font=(F,8), anchor="w",
                 wraplength=180).pack(fill=tk.X, pady=(3,6))

        user_id = u.get("id") or u.get("user_id") or u.get("email", "demo_user")

        demo_actions = [
            (VIO, "😰  High Stress Day",   "high_stress",  30),
            (GRN, "😌  Good Day",          "low_stress",   30),
            (RED, "🆘  Crisis Scenario",    "crisis",        5),
            (BLU, "📈  Improvement Trend",  "improving",    40),
            (MUT, "📊  Mixed Seed (50)",    "mixed",        50),
        ]

        for color, label, scenario, n in demo_actions:
            btn = tk.Button(
                self._det_frame,
                text=label,
                command=lambda uid=user_id, sc=scenario, cnt=n, lbl=label: self._run_demo(
                    f"{lbl} → {uid}", {"user_id": uid, "n": cnt, "scenario": sc}
                ),
                bg=CARD2, fg=color, activebackground=BDR, activeforeground=color,
                relief=tk.FLAT, font=(F, 8, "bold"), anchor="w",
                cursor="hand2", padx=8, pady=5,
            )
            btn.pack(fill=tk.X, pady=2)
            btn.bind("<Enter>", lambda e, b=btn: b.config(bg=BDR))
            btn.bind("<Leave>", lambda e, b=btn: b.config(bg=CARD2))

    def _demo_log_write(self, msg, level="info"):
        """Redirect demo messages to the main activity log."""
        log_level = "success" if level == "ok" else level if level in ("warn", "error") else "info"
        self._log(f"[Demo] {msg}", log_level)

    def _run_demo(self, label, payload):
        def _go():
            if not self._is_backend_alive():
                self.root.after(0, self._demo_log_write,
                    "Backend offline — press Start ScreenSense first.", "err")
                return
            self.root.after(0, self._demo_log_write, f"Running: {label}...", "info")
            try:
                d = self._api_post("/api/test/seed", json.dumps(payload).encode())
                n = d.get("entries_created", d.get("seeded", "?"))
                self.root.after(0, self._demo_log_write,
                    f"✓ {label} — {n} entries added.", "ok")
                # Auto-retrain so metrics update
                time.sleep(2)
                self._do_retrain()
            except Exception as e:
                self.root.after(0, self._demo_log_write, f"Error: {e}", "err")
        threading.Thread(target=_go, daemon=True).start()

    # ── Tab 4: Guide ──────────────────────────────────────────────────────

    def _build_tab_guide(self):
        tab = tk.Frame(self._nb, bg=BG)
        tab.columnconfigure(0, weight=1)
        tab.columnconfigure(1, weight=1)
        self._nb.add(tab, text="  Guide  ")

        # Left: steps
        lo, lc = card(tab)
        lo.grid(row=0, column=0, sticky="nsew", padx=(0,8), pady=8)
        section_label(lc, "Getting Started")

        steps = [
            (VIO, "1  Launch the App",
             "Press 'Start ScreenSense' on the left.\n"
             "The backend API and Expo tunnel start automatically.\n"
             "Ready in ~15 seconds — watch the console for progress."),
            (BLU, "2  Connect Your Phone or Browser",
             "On your phone: install Expo Go (iOS/Android) and scan the QR code.\n"
             "The tunnel works from anywhere — no need to be on the same Wi-Fi.\n\n"
             "No phone? Click 'Open in Browser' in the Mobile Access panel\n"
             "to use the full web version directly in your browser."),
            (GRN, "3  Complete a Check-In",
             "Work through the 7-step wellness check-in.\n"
             "Each submission feeds the live AI model and updates\n"
             "your stress prediction and care pathway in real time."),
            (YLW, "4  View Your Analysis",
             "See your predicted stress score, SHAP feature breakdown,\n"
             "NHS care level, and nearby place recommendations\n"
             "personalised to your current stress state."),
            (GRN, "5  Model is Production-Ready",
             "The AI is already trained on clinically-grounded synthetic data.\n"
             "Use the Demo tab to trigger showcase scenarios,\n"
             "or the AI & Training tab to update the model with new data."),
        ]

        sf = tk.Frame(lc, bg=CARD)
        sf.pack(fill=tk.BOTH, expand=True, padx=12, pady=8)

        for color, title, body_text in steps:
            row = tk.Frame(sf, bg=CARD2)
            row.pack(fill=tk.X, pady=4)
            tk.Frame(row, bg=color, width=4).pack(side=tk.LEFT, fill=tk.Y)
            inner = tk.Frame(row, bg=CARD2)
            inner.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=8)
            tk.Label(inner, text=title, fg=color, bg=CARD2,
                     font=(F,10,"bold"), anchor="w").pack(fill=tk.X)
            tk.Label(inner, text=body_text, fg=MUT, bg=CARD2,
                     font=(F,9), anchor="w", justify=tk.LEFT,
                     wraplength=340).pack(fill=tk.X, pady=(3,0))

        # Right: NHS levels + app store note
        ro, rc = card(tab)
        ro.grid(row=0, column=1, sticky="nsew", pady=8)
        section_label(rc, "NHS Stepped Care — How the App Responds")

        levels = [
            (GRN, "Level 1  —  Low Stress",
             "Self-help nudges, breathing exercises,\n"
             "and nearby park / green space recommendations."),
            (BLU, "Level 2  —  Mild Stress",
             "Guided self-help and personalised place\n"
             "recommendations (cafes, libraries, gyms)."),
            (YLW, "Level 3  —  Moderate Stress",
             "Structured CBT-style prompts and\n"
             "encouragement to speak with a counsellor."),
            (RED, "Level 4  —  High / Crisis",
             "Immediate NHS crisis signposting with\n"
             "contact numbers. Triggered automatically."),
        ]

        lf = tk.Frame(rc, bg=CARD)
        lf.pack(fill=tk.X, padx=12, pady=8)
        for col, title, desc in levels:
            row = tk.Frame(lf, bg=CARD2)
            row.pack(fill=tk.X, pady=4)
            tk.Frame(row, bg=col, width=4).pack(side=tk.LEFT, fill=tk.Y)
            inner = tk.Frame(row, bg=CARD2)
            inner.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=8)
            tk.Label(inner, text=title, fg=col, bg=CARD2,
                     font=(F,10,"bold"), anchor="w").pack(fill=tk.X)
            tk.Label(inner, text=desc, fg=MUT, bg=CARD2,
                     font=(F,9), anchor="w", justify=tk.LEFT,
                     wraplength=300).pack(fill=tk.X, pady=(3,0))

        # App store / distribution note
        dist_f = tk.Frame(rc, bg=CARD2)
        dist_f.pack(fill=tk.X, padx=12, pady=(4,12))
        tk.Frame(dist_f, bg=VIO, width=4).pack(side=tk.LEFT, fill=tk.Y)
        di = tk.Frame(dist_f, bg=CARD2)
        di.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=8)
        tk.Label(di, text="Can't install Expo Go?", fg=VIO, bg=CARD2,
                 font=(F,9,"bold")).pack(anchor="w")
        tk.Label(di,
                 text="Use the web version — click 'Open in Browser' in the\n"
                      "Mobile Access panel. The full app runs in any modern browser.\n"
                      "The tunnel URL works globally, not just on local Wi-Fi.",
                 fg=MUT, bg=CARD2, font=(F,9),
                 anchor="w", justify=tk.LEFT).pack(anchor="w", pady=(3,0))

    # ══════════════════════════════════════════════════════════════════════
    # Shared sub-widgets
    # ══════════════════════════════════════════════════════════════════════

    def _folder_btn(self, parent, name, path):
        short = path.replace(BASE, ".").replace(os.path.expanduser("~"), "~")
        f = tk.Frame(parent, bg=CARD2, cursor="hand2")
        f.pack(fill=tk.X, padx=10, pady=3)
        left = tk.Frame(f, bg=CARD2)
        left.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(10,6), pady=6)
        tk.Label(left, text=name, fg=TXT, bg=CARD2,
                 font=(F,10,"bold"), anchor="w").pack(fill=tk.X)
        tk.Label(left, text=short[:38], fg=SUB, bg=CARD2,
                 font=(FC,8), anchor="w").pack(fill=tk.X)
        arr = tk.Label(f, text=">", fg=SUB, bg=CARD2, font=(F,11))
        arr.pack(side=tk.RIGHT, padx=8)
        def _open(e=None, p=path): self._open_folder(p)
        def _on(e):
            for w in [f,left,arr]: w.config(bg=BDR)
        def _off(e):
            for w in [f,left,arr]: w.config(bg=CARD2)
        for w in [f,left,arr]:
            w.bind("<Button-1>", _open)
            w.bind("<Enter>", _on)
            w.bind("<Leave>", _off)

    def _draw_default_charts(self):
        self.root.update_idletasks()
        self._f1_chart.set_data([0.770,0.772,0.771,0.774],
                                [0.769,0.770,0.770,0.771])
        self._shap_chart.set_data({
            "Screen time":    33.9,
            "Scroll session": 15.2,
            "Energy level":   13.4,
            "Sleep hours":    12.9,
            "Mood valence":    9.7,
            "Heart rate":      8.2,
            "Hour of day":     6.7,
        })
        self._donut.set_data([38,45,17])

    # ══════════════════════════════════════════════════════════════════════
    # Console helpers
    # ══════════════════════════════════════════════════════════════════════

    def _log(self, msg, level="info"):
        ts = time.strftime("%H:%M:%S")
        self._console.config(state=tk.NORMAL)
        self._console.insert(tk.END, f"{ts}  ", "ts")
        self._console.insert(tk.END, msg + "\n", level)
        self._console.see(tk.END)
        self._console.config(state=tk.DISABLED)

    def _clear_console(self):
        self._console.config(state=tk.NORMAL)
        self._console.delete("1.0", tk.END)
        self._console.config(state=tk.DISABLED)

    def _tlog(self, msg):
        self._train_log.config(text=msg)

    # ══════════════════════════════════════════════════════════════════════
    # Backend comms
    # ══════════════════════════════════════════════════════════════════════

    def _is_backend_alive(self):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{BACKEND_PORT}/health",
                                   timeout=2)
            return True
        except Exception:
            return False

    def _api_post(self, path, data=b"{}"):
        req = urllib.request.Request(
            f"http://127.0.0.1:{BACKEND_PORT}{path}",
            method="POST",
            headers={"Content-Type":"application/json"},
            data=data)
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())

    def _api_get(self, path):
        with urllib.request.urlopen(
                f"http://127.0.0.1:{BACKEND_PORT}{path}", timeout=5) as r:
            return json.loads(r.read())

    # ══════════════════════════════════════════════════════════════════════
    # Status polling
    # ══════════════════════════════════════════════════════════════════════

    def _poll_loop(self):
        def _loop():
            while True:
                self._poll_once()
                time.sleep(2)
        threading.Thread(target=_loop, daemon=True).start()

    def _poll_once(self):
        alive = self._is_backend_alive()
        expo  = "expo" in self.procs and self.procs["expo"].poll() is None
        self.root.after(0, self._update_status_ui, alive, expo)
        if alive:
            self.root.after(0, self._fetch_ml_data)

    def _update_status_ui(self, backend, expo):
        self._update_chip(self._chip_backend, backend, "Online",  "Offline")
        self._update_chip(self._chip_expo,    expo,    "Running", "Offline")
        self._update_chip(self._chip_db,      backend, "SQLite",  "-")
        if backend and expo:
            self._set_global(GRN, "All Systems Online")
        elif backend:
            self._set_global(YLW, "Backend Online")
        else:
            self._set_global(SUB, "Services Offline")

    def _update_chip(self, pair, ok, ok_text, off_text):
        d, v = pair
        col  = GRN if ok else SUB
        d.itemconfig("dot", fill=col, outline=col)
        v.config(text=ok_text if ok else off_text, fg=col if ok else SUB)

    def _set_global(self, col, text):
        self._global_dot.itemconfig("dot", fill=col, outline=col)
        self._global_lbl.config(text=text, fg=col)

    def _fetch_ml_data(self):
        try:
            d = self._api_get("/api/ml/history")
            hist = d.get("history", [])
            self._retrain_hist = hist
            self._metric_vars["retrain_n"].config(text=str(len(hist)))
            if hist:
                f1s_new = [h.get("new_f1_weighted",0) for h in hist]
                f1s_old = [h.get("old_f1_weighted",0) for h in hist]
                self._f1_chart.set_data(f1s_new, f1s_old)
                self._metric_vars["rf_f1"].config(
                    text=f"{hist[-1].get('new_f1_weighted',0.774):.3f}")
            self._update_retrain_panel(hist)
        except Exception: pass

        try:
            d = self._api_get("/api/ml/evaluate")
            if d.get("accuracy"):
                self._metric_vars["rf_acc"].config(
                    text=f"{d['accuracy']*100:.1f}%")
            fi = d.get("feature_importances")
            if fi:
                fi_pct = {k: round(v*100,1) for k,v in fi.items()}
                self._shap_chart.set_data(fi_pct)
        except Exception: pass

        try:
            d = self._api_get("/api/entries/demo_user?limit=500")
            entries = d.get("entries", d) if isinstance(d,dict) else d
            if isinstance(entries, list):
                self._metric_vars["entry_n"].config(text=str(len(entries)))
                low=mod=hi=0
                for e in entries:
                    sc = float(e.get("predicted_stress_score",0.5))
                    if   sc < 0.35: low += 1
                    elif sc > 0.65: hi  += 1
                    else:           mod += 1
                if low+mod+hi > 0:
                    self._donut.set_data([low,mod,hi])
        except Exception: pass

    def _update_retrain_panel(self, hist):
        for w in self._retrain_frame.winfo_children(): w.destroy()
        if not hist:
            tk.Label(self._retrain_frame, text="No retrain history yet.",
                     fg=SUB, bg=CARD, font=(F,9)).pack(pady=16)
            return
        for h in reversed(hist[-5:]):
            f1n  = h.get("new_f1_weighted",0)
            f1o  = h.get("old_f1_weighted",0)
            diff = f1n - f1o
            sign = "+" if diff >= 0 else ""
            ts   = h.get("timestamp","")[:19].replace("T"," ")
            row  = tk.Frame(self._retrain_frame, bg=CARD2)
            row.pack(fill=tk.X, pady=3)
            tk.Frame(row, bg=VIO, width=3).pack(side=tk.LEFT, fill=tk.Y)
            inner = tk.Frame(row, bg=CARD2)
            inner.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=8, pady=5)
            top   = tk.Frame(inner, bg=CARD2)
            top.pack(fill=tk.X)
            tk.Label(top, text=f"F1  {f1n:.3f}", fg=TXT, bg=CARD2,
                     font=(FC,10,"bold")).pack(side=tk.LEFT)
            col2 = GRN if diff>=0 else RED
            tk.Label(top, text=f"  ({sign}{diff*100:.1f}%)", fg=col2, bg=CARD2,
                     font=(F,9)).pack(side=tk.LEFT)
            tk.Label(inner, text=ts or "-", fg=SUB, bg=CARD2,
                     font=(FC,8)).pack(anchor="w")

    # ══════════════════════════════════════════════════════════════════════
    # Launch sequence
    # ══════════════════════════════════════════════════════════════════════

    def _handle_launch(self):
        if self.launching: return
        self.launching = True
        self._launch_btn.config(state=tk.DISABLED, text="Launching...")
        self._progress["value"] = 0
        threading.Thread(target=self._launch_sequence, daemon=True).start()

    def _launch_sequence(self):
        self._log("=== ScreenSense Launch ===")
        local_ip = self._get_local_ip()
        self._log(f"Local IP: {local_ip}")

        self._set_progress(5)
        self._log("Checking Expo tunnel dependency...")
        self._ensure_ngrok()

        self._set_progress(10)
        self._log("Starting backend...")
        self._start_backend()
        self._set_progress(40)

        # Wait for backend to be alive before tunnelling it
        for _ in range(30):
            if self._is_backend_alive():
                self._log("Backend ready.", "success")
                break
            time.sleep(0.5)
        else:
            self._log("Backend taking longer than expected — continuing anyway.", "warn")

        self._set_progress(50)
        self._log("Starting backend tunnel (localtunnel)...")
        self._start_backend_tunnel_sync(local_ip)   # blocks until URL is written
        self._set_progress(60)

        self._log("Starting Expo (tunnel — accessible globally)...")
        self._start_expo()
        self._set_progress(90)

        self._set_progress(100)
        self._log("All services launched. Scan the QR or click Open in Browser.", "success")
        self.root.after(0, lambda: (
            self._launch_btn.config(state=tk.NORMAL, text="Start ScreenSense"),
        ))
        self.launching = False

    def _set_progress(self, val):
        self.root.after(0, lambda: self._progress.config(value=val))

    def _ensure_ngrok(self):
        try:
            r = subprocess.run(
                ["cmd","/c","npm","list","-g","@expo/ngrok"],
                capture_output=True, text=True, timeout=15)
            if "@expo/ngrok" in r.stdout:
                return
        except Exception: pass
        self._log("Installing @expo/ngrok (one-time, ~30s)...", "warn")
        try:
            subprocess.run(
                ["cmd","/c","npm","install","-g","@expo/ngrok@^4.1.0"],
                capture_output=True, text=True, timeout=120)
            self._log("@expo/ngrok installed.", "success")
        except Exception as e:
            self._log(f"ngrok install warning: {e}", "warn")

    def _start_backend(self):
        if "backend" in self.procs and self.procs["backend"].poll() is None:
            self._log("Backend already running.", "warn"); return
        py  = VENV_PY if os.path.exists(VENV_PY) else sys.executable
        cmd = [py, "-m", "uvicorn", "app.main:app",
               "--host","0.0.0.0","--port",str(BACKEND_PORT),
               "--reload","--no-access-log"]
        kw  = {"cwd":BACKEND, "stdout":subprocess.PIPE,
               "stderr":subprocess.STDOUT, "text":True}
        if sys.platform=="win32":
            kw["creationflags"] = subprocess.CREATE_NO_WINDOW
        try:
            p = subprocess.Popen(cmd, **kw)
            self.procs["backend"] = p
            threading.Thread(target=self._tail, args=(p,"backend"), daemon=True).start()
        except Exception as e:
            self._log(f"Backend error: {e}", "error")

    def _start_expo(self):
        if "expo" in self.procs and self.procs["expo"].poll() is None:
            self._log("Expo already running.", "warn"); return
        env = os.environ.copy()
        env["NO_COLOR"] = "1"
        _free_port(8081)
        _free_port(4040)
        try:
            subprocess.run(["taskkill", "/F", "/IM", "ngrok.exe"],
                           capture_output=True, timeout=5)
        except Exception:
            pass
        import time as _t; _t.sleep(1)
        flag = "--tunnel"
        kw  = {"cwd":FRONTEND, "stdout":subprocess.PIPE,
               "stderr":subprocess.STDOUT, "text":True, "env":env}
        if sys.platform=="win32":
            kw["creationflags"] = subprocess.CREATE_NO_WINDOW
            cmd = ["cmd","/c","npx","expo","start", flag]
        else:
            cmd = ["npx","expo","start", flag]
        try:
            p = subprocess.Popen(cmd, **kw)
            self.procs["expo"] = p
            threading.Thread(target=self._tail_expo, args=(p,), daemon=True).start()
        except Exception as e:
            self._log(f"Expo error: {e}", "error")

    def _tail(self, proc, name):
        SKIP = ("watchfiles.main", "GET /health", "GET /api/ml",
                "GET /api/entries", "127.0.0.1")
        for line in proc.stdout:
            line = line.rstrip()
            if not line: continue
            if any(s in line for s in SKIP): continue
            level = ("error" if "ERROR" in line
                     else "warn" if "WARNING" in line
                     else "success" if "startup complete" in line.lower()
                     else "info")
            self.root.after(0, self._log, f"[{name}] {line}", level)

    def _tail_expo(self, proc):
        ANSI_ESC = re.compile(
            r'\x1b(?:'
            r'\[[0-?]*[ -/]*[@-~]'
            r'|[@-Z\\-_]'
            r'|\][^\x07\x1b]*(?:\x07|\x1b\\)'
            r'|[PX^_][^\x1b]*\x1b\\'
            r')'
        )
        URL_PAT = re.compile(
            r'exp\+?://[^\s\x1b\x07\]\'"\\)><,]+'
            r'|https?://[a-zA-Z0-9_\-]+\.exp\.direct[^\s\x1b\x07]*'
            r'|https?://u\.expo\.dev[^\s\x1b\x07]*'
        )
        CTRL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')
        _ngrok_fetched = [False]

        def _fetch_ngrok_url():
            import urllib.request, json as _json, time as _time
            for _ in range(15):
                try:
                    with urllib.request.urlopen(
                        'http://localhost:4040/api/tunnels', timeout=2
                    ) as r:
                        data = _json.loads(r.read())
                        for t in data.get('tunnels', []):
                            pub = t.get('public_url', '')
                            if pub.startswith('https://') and 'exp.direct' in pub:
                                url = pub.replace('https://', 'exp://', 1)
                                _ngrok_fetched[0] = True
                                self.root.after(0, self._update_qr, url)
                                return
                except Exception:
                    pass
                _time.sleep(1)

        def _process_subline(raw: str):
            raw = raw.strip()
            if not raw: return
            clean = CTRL.sub('', ANSI_ESC.sub('', raw))
            if not clean: return
            m = URL_PAT.search(clean)
            if m:
                url = m.group(0).rstrip('/.,;:\x07')
                _ngrok_fetched[0] = True
                self.root.after(0, self._update_qr, url)
            if 'Tunnel ready' in clean and not _ngrok_fetched[0]:
                threading.Thread(target=_fetch_ngrok_url, daemon=True).start()
            level = ("error"   if "Error" in clean or "error" in clean
                     else "success" if "Tunnel ready" in clean or "connected" in clean.lower()
                     else "warn"    if "warn" in clean.lower() or "deprecated" in clean.lower()
                     else "info")
            self.root.after(0, self._log, f"[expo] {clean}", level)

        for line in proc.stdout:
            for subline in line.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
                _process_subline(subline)

    # ── Backend tunnel (localtunnel — free, no account needed) ───────────────

    def _start_backend_tunnel_sync(self, local_ip: str):
        """
        Synchronously start a public tunnel for port 8000.
        Blocks until the URL is known, then writes EXPO_PUBLIC_API_URL to
        screensense-app/.env.local BEFORE Expo starts — so the Metro bundler
        picks up the correct backend URL from the very first QR scan.
        """
        env_path = os.path.join(FRONTEND, ".env.local")

        def _write_env(url: str):
            self._backend_url = url
            try:
                with open(env_path, "w", encoding="utf-8") as f:
                    f.write(f"EXPO_PUBLIC_API_URL={url}\n")
                self.root.after(0, self._log, f"Backend API URL: {url}", "success")
                self.root.after(0, self._backend_url_lbl.config,
                    {"text": url, "fg": GRN})
            except Exception as e:
                self.root.after(0, self._log, f"Could not write .env.local: {e}", "warn")

        # Try localtunnel — gives a globally accessible HTTPS URL
        try:
            lt_cmd = ["cmd", "/c", "npx", "--yes", "localtunnel",
                      "--port", str(BACKEND_PORT)]
            lt = subprocess.Popen(
                lt_cmd,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, creationflags=subprocess.CREATE_NO_WINDOW
            )
            self.procs["lt_backend"] = lt

            import re as _re
            url_pat = _re.compile(r'https?://[a-zA-Z0-9\-]+\.loca\.lt')
            deadline = time.time() + 30
            for line in lt.stdout:
                line = line.strip()
                if not line:
                    continue
                m = url_pat.search(line)
                if m:
                    tunnel_url = m.group(0).rstrip('/') + "/api"
                    _write_env(tunnel_url)
                    # Drain stdout silently so the process doesn't block
                    threading.Thread(
                        target=lambda: [_ for _ in lt.stdout],
                        daemon=True).start()
                    return
                if time.time() > deadline:
                    break

            raise RuntimeError("localtunnel URL not received within 30 s")

        except Exception as e:
            self.root.after(0, self._log,
                f"localtunnel unavailable ({e}) — falling back to LAN IP.", "warn")
            lan_url = f"http://{local_ip}:{BACKEND_PORT}/api"
            _write_env(lan_url)

    def _stop_all(self):
        for name, p in list(self.procs.items()):
            try: p.terminate(); self._log(f"Stopped {name}.", "warn")
            except Exception: pass
        self.procs.clear()
        self._progress["value"] = 0
        # Reset backend URL display
        self.root.after(0, self._backend_url_lbl.config,
            {"text": "Not running", "fg": SUB})
        try:
            subprocess.run(["taskkill", "/F", "/IM", "ngrok.exe"],
                           capture_output=True, timeout=5)
        except Exception:
            pass
        _free_port(4040)
        _free_port(8081)

    # ══════════════════════════════════════════════════════════════════════
    # Training actions
    # ══════════════════════════════════════════════════════════════════════

    def _retrain(self):
        threading.Thread(target=self._do_retrain, daemon=True).start()

    def _do_retrain(self):
        self.root.after(0, self._tlog, "Updating AI model...")
        try:
            d      = self._api_post("/api/retrain")
            status = d.get("status", "unknown")
            if status == "skipped":
                reason = d.get("reason", "Not enough data")
                avail  = d.get("entries_available", "?")
                msg    = f"Skipped — {reason}"
                hint   = f"  Tip: use Demo tab to seed entries first (need ≥ 10, have {avail})."
                self.root.after(0, self._tlog, msg)
                self.root.after(0, self._log,  msg, "warn")
                self.root.after(0, self._log,  hint, "info")
            else:
                f1n = d.get("new_f1_weighted", 0)
                f1o = d.get("old_f1_weighted", 0)
                saved = "saved" if d.get("improved", True) else "not saved (no improvement)"
                msg = f"Model updated ({saved})  —  F1 {f1o:.3f} → {f1n:.3f}"
                self.root.after(0, self._tlog, msg)
                self.root.after(0, self._log,  msg, "success")
        except Exception as e:
            self.root.after(0, self._tlog, f"Error: {e}")
            self.root.after(0, self._log,  f"Retrain failed: {e}", "error")

    def _seed_and_train(self):
        def _run():
            self._do_seed(200); time.sleep(5); self._do_retrain()
        threading.Thread(target=_run, daemon=True).start()

    def _do_seed(self, n=200):
        self.root.after(0, self._tlog, f"Seeding {n} test entries...")
        try:
            d = self._api_post("/api/test/seed",
                json.dumps({"user_id":"demo_user","n":n}).encode())
            count = d.get("entries_created", d.get("seeded","?"))
            msg = f"Seeded {count} entries."
            self.root.after(0, self._tlog, msg)
            self.root.after(0, self._log,  msg, "success")
        except Exception as e:
            self.root.after(0, self._tlog, f"Seed failed: {e}")
            self.root.after(0, self._log,  f"Seed error: {e}", "error")

    def _run_n_cycles(self):
        n = self._cycle_var.get()
        def _run():
            for i in range(n):
                self.root.after(0, self._tlog, f"Cycle {i+1}/{n} — seeding...")
                self.root.after(0, self._log,  f"Cycle {i+1}/{n} — seeding", "info")
                self._do_seed();    time.sleep(5)
                self.root.after(0, self._tlog, f"Cycle {i+1}/{n} — training...")
                self._do_retrain(); time.sleep(3)
            self.root.after(0, self._tlog, f"All {n} cycles complete.")
            self.root.after(0, self._log,  f"All {n} training cycles complete.", "success")
        threading.Thread(target=_run, daemon=True).start()

    # ══════════════════════════════════════════════════════════════════════
    # Utilities
    # ══════════════════════════════════════════════════════════════════════

    def _get_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8",80)); ip=s.getsockname()[0]; s.close(); return ip
        except Exception: return "127.0.0.1"

    def _open_folder(self, path):
        os.makedirs(path, exist_ok=True)
        if sys.platform=="win32": subprocess.Popen(["explorer",os.path.normpath(path)])
        elif sys.platform=="darwin": subprocess.Popen(["open",path])
        else: subprocess.Popen(["xdg-open",path])

    def run(self):
        self._log("ScreenSense Control Panel ready.")
        self._log("Press 'Start ScreenSense' to launch all services.")
        self._log("New here? Check the 'Guide' tab for step-by-step instructions.", "warn")
        self.root.mainloop()


# ── Entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = ControlPanel()
    app.run()
