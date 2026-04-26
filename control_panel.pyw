#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ScreenSense Control Panel  -  desktop launcher and AI dashboard.
Run:  python control_panel.py   (or double-click the .bat launcher)
"""

import tkinter as tk
from tkinter import ttk
import threading, time, json, socket, subprocess, sys, os, re, urllib.request

# ── Paths ──────────────────────────────────────────────────────────────────
BASE     = os.path.dirname(os.path.abspath(__file__))
BACKEND  = os.path.join(BASE, "backend")
FRONTEND = os.path.join(BASE, "screensense-app")
VENV_PY  = os.path.join(BACKEND, "venv", "Scripts", "python.exe")
ML_DIR   = os.path.join(BACKEND, "data", "models")
DL_DIR   = os.path.expanduser("~/Downloads")
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
                if pid > 4:  # never kill System (PID 4)
                    subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                                   capture_output=True, timeout=5)
    except Exception:
        pass  # best-effort; Expo will prompt if port is still busy


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

        # legend
        self.create_rectangle(w-90, pad_t, w-pad_r, pad_t+28,
                               fill=CARD, outline=BDR)
        self.create_line(w-86, pad_t+9,  w-72, pad_t+9,  fill=VIO, width=2)
        self.create_line(w-86, pad_t+20, w-72, pad_t+20, fill=BLU, width=2)
        self.create_text(w-70, pad_t+9,  text="New F1", fill=MUT,
                         font=(FC,7), anchor="w")
        self.create_text(w-70, pad_t+20, text="Old F1", fill=MUT,
                         font=(FC,7), anchor="w")

        # x-axis labels
        if self._s1:
            n = len(self._s1)
            for i in range(n):
                x = pad_l + i/(n-1)*( w-pad_l-pad_r) if n>1 else pad_l
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
            self.create_rectangle(lpad, y, lpad+bw, y+bar_h,
                                  fill=col, outline="", width=0)
            # subtle background track
            self.create_rectangle(lpad, y, lpad+(w-lpad-rpad), y+bar_h,
                                  fill="", outline=BDR, width=1)
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
        self._labels = ["Low","Moderate","High"]
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
            # outer arc
            self.create_arc(m, m, s-m, s-m, start=start, extent=ext,
                            fill=col, outline=BG, width=2, style=tk.ARC)
            # inner arc (makes it look thick)
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
        self._expo_url = ""

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
    # LEFT panel  (always visible)
    # ══════════════════════════════════════════════════════════════════════

    def _build_left(self, parent):
        col = tk.Frame(parent, bg=BG)
        col.grid(row=0, column=0, sticky="nsew", padx=(0,8))
        col.rowconfigure(1, weight=1)

        self._build_launch_card(col)
        self._build_console_card(col)
        self._build_mobile_card(col)

    # ── Launch Control ────────────────────────────────────────────────────

    def _build_launch_card(self, parent):
        o, c = card(parent)
        o.grid(row=0, column=0, sticky="ew", pady=(0,8))
        section_label(c, "Launch Control")

        bf = tk.Frame(c, bg=CARD)
        bf.pack(fill=tk.X, padx=12, pady=8)
        self._launch_btn = solid_btn(bf, "Start ScreenSense",
                                     self._handle_launch, color=VIO, width=20)
        self._launch_btn.pack(fill=tk.X, pady=(0,6))
        ghost_btn(bf, "Stop All Services", self._stop_all,
                  width=20).pack(fill=tk.X)

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

    # ── Console ────────────────────────────────────────────────────────────

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

    # ── Mobile Access ─────────────────────────────────────────────────────

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

        lbl(info, "Scan with Expo Go", fg=MUT, size=9).pack(anchor="w")
        self._url_lbl = tk.Label(info, text="Waiting for tunnel...",
                                 fg=VIO, bg=CARD, font=(F,8),
                                 wraplength=150, anchor="w", justify=tk.LEFT)
        self._url_lbl.pack(anchor="w", pady=(4,6))
        solid_btn(info, "Open in Browser",
                  lambda: self._open_url("http://localhost:8081"),
                  color=BLU, width=14, pady=4).pack(anchor="w")

    def _draw_qr_placeholder(self):
        c = self._qr_canvas
        c.delete("all")
        c.create_rectangle(0,0,90,90, fill="#f0f0f0", outline="")
        # corner squares
        for x, y in [(3,3),(58,3),(3,58)]:
            c.create_rectangle(x,y,x+29,y+29, fill="#222", outline="")
            c.create_rectangle(x+4,y+4,x+25,y+25, fill="#f0f0f0", outline="")
            c.create_rectangle(x+8,y+8,x+21,y+21, fill="#222", outline="")
        # centre text
        c.create_text(45,45, text="Waiting\nfor\ntunnel", fill="#888",
                      font=(F,7), justify=tk.CENTER)

    def _update_qr(self, url):
        self._expo_url = url
        self._url_lbl.config(text=url)
        try:
            import qrcode
            from PIL import ImageTk
            img = qrcode.make(url).resize((90, 90))
            self._qr_img = ImageTk.PhotoImage(img)
            self._qr_canvas.delete("all")
            self._qr_canvas.create_image(0, 0, image=self._qr_img, anchor="nw")
            self._log("QR code ready — scan with Expo Go.", "success")
            return
        except ImportError:
            # Auto-install qrcode + Pillow, then retry
            if not getattr(self, '_qr_installing', False):
                self._qr_installing = True
                self._log("Installing qrcode library (one-time)...", "warn")
                threading.Thread(target=self._install_qrcode_pkg, daemon=True).start()
        except Exception:
            pass
        # Fallback: draw a symbolic QR with the URL text inside
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
        """Install qrcode[pil] in the background, then redraw QR."""
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

        # Style the notebook tabs to match the dark theme
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Dark.TNotebook",
                        background=BG, borderwidth=0, tabmargins=0)
        style.configure("Dark.TNotebook.Tab",
                        background=CARD2, foreground=MUT,
                        font=(F,10), padding=(18,8),
                        borderwidth=0)
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

        # Metric tiles row
        mf_outer, mf = card(tab)
        mf_outer.grid(row=0, column=0, columnspan=2, sticky="ew",
                      pady=(8,8), padx=(0,0))
        section_label(mf, "Live Model Metrics")

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

        # Bottom left: F1 learning curve
        lo, lc = card(tab)
        lo.grid(row=1, column=0, sticky="nsew", pady=(0,8), padx=(0,8))
        section_label(lc, "F1 Score Learning Curve  (each retrain cycle)")
        self._f1_chart = LineChart(lc, h=150)
        self._f1_chart.pack(fill=tk.BOTH, expand=True, padx=8, pady=(4,8))
        lbl(lc, "Shows whether the model improves after each training run.",
            fg=SUB, size=8).pack(padx=12, pady=(0,6))

        # Bottom right: Stress donut + quick stats
        ro, rc = card(tab)
        ro.grid(row=1, column=1, sticky="nsew", pady=(0,8))
        section_label(rc, "Stress Distribution  (all entries)")

        dc_row = tk.Frame(rc, bg=CARD)
        dc_row.pack(fill=tk.X, padx=12, pady=8)
        self._donut = DonutChart(dc_row, size=130)
        self._donut.pack(side=tk.LEFT, padx=(4,10))

        leg = tk.Frame(dc_row, bg=CARD)
        leg.pack(side=tk.LEFT, fill=tk.Y, pady=8)
        for txt, col, key in [("Low stress",  GRN, "low"),
                               ("Moderate",    YLW, "mod"),
                               ("High stress", RED, "hi")]:
            r = tk.Frame(leg, bg=CARD)
            r.pack(fill=tk.X, pady=5)
            tk.Frame(r, bg=col, width=10, height=10).pack(side=tk.LEFT)
            tk.Label(r, text=f"  {txt}", fg=MUT, bg=CARD,
                     font=(F,9)).pack(side=tk.LEFT)

        lbl(rc, "Updated every 2 seconds from the live backend.",
            fg=SUB, size=8).pack(padx=12, pady=(0,8))

    # ── Tab 2: ML & Training ──────────────────────────────────────────────

    def _build_tab_training(self):
        tab = tk.Frame(self._nb, bg=BG)
        tab.rowconfigure(0, weight=1)
        tab.columnconfigure(0, weight=1)
        tab.columnconfigure(1, minsize=240, weight=0)
        self._nb.add(tab, text="  ML & Training  ")

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
        section_label(sc, "SHAP Feature Importances  (Random Forest)")
        lbl(sc, "Which factors most influence your stress prediction score.",
            fg=SUB, size=8).pack(padx=12, pady=(4,2))
        self._shap_chart = BarChart(sc, h=175)
        self._shap_chart.pack(fill=tk.BOTH, expand=True, padx=8, pady=(0,8))

        # Training controls
        to_, tc = card(left)
        to_.grid(row=1, column=0, sticky="nsew", pady=(0,8))
        section_label(tc, "Training Controls")
        lbl(tc, "RF trains in seconds (not hours — that's deep learning on images).",
            fg=SUB, size=8).pack(padx=12, pady=(4,2))

        cf = tk.Frame(tc, bg=CARD)
        cf.pack(fill=tk.X, padx=12, pady=8)

        # Pre-train button — most prominent
        pretrain_f = tk.Frame(cf, bg=CARD2, relief=tk.FLAT)
        pretrain_f.pack(fill=tk.X, pady=(0,10))
        tk.Frame(pretrain_f, bg=YLW, width=4).pack(side=tk.LEFT, fill=tk.Y)
        pf_inner = tk.Frame(pretrain_f, bg=CARD2)
        pf_inner.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=8)
        tk.Label(pf_inner, text="Pre-Train for Demo  (run once before showing anyone)",
                 fg=YLW, bg=CARD2, font=(F,9,"bold")).pack(anchor="w")
        tk.Label(pf_inner,
                 text="Seeds 200 entries x 15 cycles  =  3000 entries total.  ~3 minutes.",
                 fg=MUT, bg=CARD2, font=(F,8)).pack(anchor="w", pady=(2,6))
        r0 = tk.Frame(pf_inner, bg=CARD2)
        r0.pack(fill=tk.X)
        solid_btn(r0, "Start Pre-Training",
                  self._pretrain_for_demo, color=YLW, width=18, pady=5).pack(side=tk.LEFT)
        self._pretrain_lbl = tk.Label(r0, text="", fg=MUT, bg=CARD2, font=(FC,9))
        self._pretrain_lbl.pack(side=tk.LEFT, padx=10)

        tk.Frame(cf, bg=BDR, height=1).pack(fill=tk.X, pady=(0,8))

        r1 = tk.Frame(cf, bg=CARD)
        r1.pack(fill=tk.X, pady=(0,8))
        solid_btn(r1, "Retrain RF Now",
                  self._retrain, color=VIO, width=16).pack(side=tk.LEFT, padx=(0,8))
        solid_btn(r1, "Seed + Retrain",
                  self._seed_and_train, color=GRN, width=16).pack(side=tk.LEFT)

        r2 = tk.Frame(cf, bg=CARD)
        r2.pack(fill=tk.X, pady=(0,8))
        solid_btn(r2, "Seed Data Only",
                  self._seed_data, color=BLU, width=16).pack(side=tk.LEFT, padx=(0,8))

        r3 = tk.Frame(cf, bg=CARD)
        r3.pack(fill=tk.X, pady=(0,6))
        tk.Label(r3, text="Custom cycles:", fg=MUT, bg=CARD,
                 font=(F,10)).pack(side=tk.LEFT)
        self._cycle_var = tk.IntVar(value=5)
        tk.Spinbox(r3, from_=1, to=30, textvariable=self._cycle_var,
                   width=4, bg=CARD2, fg=TXT, font=(FC,10),
                   buttonbackground=BDR, relief=tk.FLAT).pack(side=tk.LEFT, padx=8)
        solid_btn(r3, "Run",
                  self._run_n_cycles, color=SUB, width=6).pack(side=tk.LEFT)

        self._train_log = tk.Label(cf, text="Ready.", fg=MUT, bg=CARD2,
                                   font=(FC,9), anchor="w", padx=8, pady=5)
        self._train_log.pack(fill=tk.X)

        # Right side: recent retrains
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

    # ── Tab 3: Getting Started ─────────────────────────────────────────────

    def _build_tab_guide(self):
        tab = tk.Frame(self._nb, bg=BG)
        tab.columnconfigure(0, weight=1)
        tab.columnconfigure(1, weight=1)
        self._nb.add(tab, text="  Guide  ")

        # --- Left: steps ---
        lo, lc = card(tab)
        lo.grid(row=0, column=0, sticky="nsew", padx=(0,8), pady=8)
        section_label(lc, "Getting Started")

        steps = [
            (VIO, "1  Launch the App",
             "Press 'Start ScreenSense' on the left.\n"
             "The backend API and Expo server start automatically.\n"
             "Watch the Console for progress — ready in ~15 seconds."),
            (BLU, "2  Connect Your Phone",
             "Install the Expo Go app (iOS or Android).\n"
             "Scan the QR code under Mobile Access once the\n"
             "tunnel connects, or open http://localhost:8081 in a browser."),
            (GRN, "3  Complete a Check-In",
             "Open the app and work through the 7-step wellness\n"
             "check-in. Each submission feeds the live Random Forest\n"
             "model and updates the stress prediction in real time."),
            (YLW, "4  View Your Analysis",
             "After submitting, the app shows your predicted stress score,\n"
             "SHAP feature breakdown, NHS care level, and nearby\n"
             "place recommendations based on your stress state."),
            (GRN, "5  Model is Already Pre-Trained",
             "The Random Forest has already been trained through\n"
             "many cycles before this demo. The Overview tab shows\n"
             "the full F1 learning curve from all training runs."),
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

        # --- Right: NHS levels + tips ---
        ro, rc = card(tab)
        ro.grid(row=0, column=1, sticky="nsew", pady=8)
        section_label(rc, "NHS Stepped Care - How the App Responds")

        levels = [
            (GRN, "Level 1  -  Low Stress",
             "Self-help nudges, breathing exercises,\n"
             "and nearby park / green space recommendations."),
            (BLU, "Level 2  -  Mild Stress",
             "Guided self-help suggestions and personalised\n"
             "place recommendations (cafes, libraries, gyms)."),
            (YLW, "Level 3  -  Moderate Stress",
             "Structured CBT-style prompts and\n"
             "encouragement to speak to a counsellor."),
            (RED, "Level 4  -  High / Crisis",
             "Immediate NHS crisis signposting with\n"
             "contact numbers. Triggered automatically."),
        ]

        lf = tk.Frame(rc, bg=CARD)
        lf.pack(fill=tk.BOTH, expand=True, padx=12, pady=8)
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

        # Training speed note
        tf = tk.Frame(rc, bg=CARD2, relief=tk.FLAT)
        tf.pack(fill=tk.X, padx=12, pady=(0,12))
        tk.Frame(tf, bg=BLU, width=4).pack(side=tk.LEFT, fill=tk.Y)
        ti = tk.Frame(tf, bg=CARD2)
        ti.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=8)
        tk.Label(ti, text="Why does training take seconds, not hours?", fg=BLU, bg=CARD2,
                 font=(F,9,"bold")).pack(anchor="w")
        tk.Label(ti,
                 text="ScreenSense uses Random Forest on tabular data (10 features,\n"
                      "~3000 rows). That trains in 2-10 seconds.\n"
                      "Deep learning on images/text (CNNs, Transformers) takes hours\n"
                      "because of millions of parameters and GPU batch processing.\n"
                      "Different tool for a different job.",
                 fg=MUT, bg=CARD2, font=(F,9),
                 anchor="w", justify=tk.LEFT).pack(anchor="w", pady=(3,0))

    # ── Tab 4: Accounts ───────────────────────────────────────────────────

    def _build_tab_accounts(self):
        """
        Privacy-preserving account viewer. Shows display name, email,
        signup date, last login, and check-in count. NEVER shows
        password hashes, tokens, location, or journal content.
        """
        tab = tk.Frame(self._nb, bg=BG)
        tab.rowconfigure(1, weight=1)
        tab.columnconfigure(0, weight=1)
        self._nb.add(tab, text="  Accounts  ")

        # Summary + refresh row
        top_outer, top = card(tab)
        top_outer.grid(row=0, column=0, sticky="ew", pady=(8,8))
        section_label(top, "Registered Users")

        row = tk.Frame(top, bg=CARD)
        row.pack(fill=tk.X, padx=12, pady=(4,10))

        self._acc_count_var = tk.StringVar(value="—")
        tk.Label(row, textvariable=self._acc_count_var,
                 fg=VIO, bg=CARD, font=(F,18,"bold")).pack(side=tk.LEFT)
        tk.Label(row, text="  registered accounts",
                 fg=MUT, bg=CARD, font=(F,10)).pack(side=tk.LEFT, pady=(6,0))

        refresh_btn = tk.Button(row, text="  Refresh  ",
                 bg=VIO, fg=WH, font=(F,9,"bold"),
                 relief=tk.FLAT, cursor="hand2",
                 activebackground=_lighten(VIO),
                 command=lambda: threading.Thread(
                     target=self._refresh_accounts, daemon=True).start())
        refresh_btn.pack(side=tk.RIGHT, padx=4)

        tk.Label(top,
                 text="Non-sensitive fields only — no passwords, tokens, locations or journal data.",
                 fg=SUB, bg=CARD, font=(F,8,"italic")
                 ).pack(anchor="w", padx=12, pady=(0,8))

        # Scrollable list
        list_outer, list_card = card(tab)
        list_outer.grid(row=1, column=0, sticky="nsew", pady=(0,8))
        section_label(list_card, "Account Directory")

        # Header row
        hdr = tk.Frame(list_card, bg=CARD2)
        hdr.pack(fill=tk.X, padx=12, pady=(4,0))
        for txt, w in [("Name",18),("Email",30),("Joined",12),
                       ("Last login",12),("Check-ins",10)]:
            tk.Label(hdr, text=txt, fg=SUB, bg=CARD2,
                     font=(F,8,"bold"), width=w, anchor="w"
                     ).pack(side=tk.LEFT, padx=4, pady=6)

        # Scrollable canvas for rows
        cv_frame = tk.Frame(list_card, bg=CARD)
        cv_frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0,10))

        self._acc_canvas = tk.Canvas(cv_frame, bg=CARD, highlightthickness=0)
        self._acc_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        sb = tk.Scrollbar(cv_frame, orient="vertical",
                          command=self._acc_canvas.yview)
        sb.pack(side=tk.RIGHT, fill=tk.Y)
        self._acc_canvas.configure(yscrollcommand=sb.set)

        self._acc_rows_frame = tk.Frame(self._acc_canvas, bg=CARD)
        self._acc_canvas.create_window((0,0), window=self._acc_rows_frame,
                                       anchor="nw")

        def _resize(e):
            self._acc_canvas.configure(scrollregion=self._acc_canvas.bbox("all"))
        self._acc_rows_frame.bind("<Configure>", _resize)

        self._acc_status_var = tk.StringVar(
            value="Press Refresh to load account list.")
        tk.Label(list_card, textvariable=self._acc_status_var,
                 fg=SUB, bg=CARD, font=(F,8,"italic")
                 ).pack(anchor="w", padx=12, pady=(0,8))

        # Auto-load once backend is up (fire-and-forget)
        threading.Thread(target=self._refresh_accounts, daemon=True).start()

    def _refresh_accounts(self):
        """Fetch /auth/users and re-render the rows (thread-safe)."""
        try:
            data = self._api_get("/auth/users")
        except Exception as e:
            self.root.after(0, lambda:
                self._acc_status_var.set(f"Backend not reachable: {e}"))
            return

        users = data.get("users", [])
        total = data.get("total", len(users))

        def _render():
            # Clear old rows
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
                r = tk.Frame(self._acc_rows_frame, bg=r_bg)
                r.pack(fill=tk.X, pady=1)

                name  = (u.get("name")  or "—")[:24]
                email = (u.get("email") or "—")[:36]
                joined_iso = u.get("created_at") or ""
                last_iso   = u.get("last_login") or ""
                # Short human dates: "24 Apr"
                def _fmt(iso):
                    if not iso: return "—"
                    try:
                        from datetime import datetime
                        return datetime.fromisoformat(iso).strftime("%d %b")
                    except Exception:
                        return iso[:10]
                joined = _fmt(joined_iso)
                last   = _fmt(last_iso)
                count  = str(u.get("entry_count", 0))

                for txt, w in [(name,18),(email,30),(joined,12),
                               (last,12),(count,10)]:
                    tk.Label(r, text=txt, fg=TXT, bg=r_bg,
                             font=(F,9), width=w, anchor="w"
                             ).pack(side=tk.LEFT, padx=4, pady=5)

            from datetime import datetime
            self._acc_status_var.set(
                f"Loaded {total} account{'s' if total != 1 else ''} "
                f"at {datetime.now().strftime('%H:%M:%S')}.")

        self.root.after(0, _render)

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
    # Status polling (every 2 s, background thread)
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
        self._log(f"Local IP: {self._get_local_ip()}")

        self._set_progress(5)
        self._log("Checking Expo tunnel dependency...")
        self._ensure_ngrok()

        self._set_progress(10)
        self._log("Starting backend...")
        self._start_backend()
        self._set_progress(55)

        self._log("Starting Expo...")
        self._start_expo()
        self._set_progress(80)

        for _ in range(20):
            if self._is_backend_alive():
                self._log("Backend ready.", "success")
                break
            time.sleep(0.5)

        self._set_progress(100)
        self._log("All services launched. Switch to 'Overview' to see live metrics.", "success")
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
        # NO_COLOR removes ANSI colour codes from Expo output (easier URL parsing).
        # Do NOT set CI or EXPO_NO_INTERACTIVE — those prevent Expo from answering
        # its own "port in use, use 8082?" prompt and cause it to skip the dev server.
        env = os.environ.copy()
        env["NO_COLOR"] = "1"
        # Kill old Metro (8081) AND old ngrok (4040) so Expo starts a completely
        # fresh tunnel session — an orphaned ngrok causes auth failures on restart.
        _free_port(8081)
        _free_port(4040)
        # Also kill any stray ngrok.exe processes by name
        try:
            subprocess.run(["taskkill", "/F", "/IM", "ngrok.exe"],
                           capture_output=True, timeout=5)
        except Exception:
            pass
        import time as _t; _t.sleep(1)   # let ports fully release
        kw  = {"cwd":FRONTEND, "stdout":subprocess.PIPE,
               "stderr":subprocess.STDOUT, "text":True, "env":env}
        if sys.platform=="win32":
            kw["creationflags"] = subprocess.CREATE_NO_WINDOW
            cmd = ["cmd","/c","npx","expo","start","--tunnel"]
        else:
            cmd = ["npx","expo","start","--tunnel"]
        try:
            p = subprocess.Popen(cmd, **kw)
            self.procs["expo"] = p
            threading.Thread(target=self._tail_expo, args=(p,), daemon=True).start()
        except Exception as e:
            self._log(f"Expo error: {e}", "error")

    def _tail(self, proc, name):
        """Stream subprocess output to console, filtering routine noise."""
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
        """Stream Expo output and detect the tunnel URL.

        Expo SDK 54 uses \r (carriage-return only) to overwrite lines in its
        interactive display, so a single stdout 'line' may contain multiple
        \r-delimited sub-lines.  We split on both \n and \r so the URL is
        never hidden inside a CR-overwritten block.
        """
        # Strip CSI, OSC (terminal hyperlinks), and other ANSI/VT sequences
        ANSI_ESC = re.compile(
            r'\x1b(?:'
            r'\[[0-?]*[ -/]*[@-~]'             # CSI  (colour, cursor, etc.)
            r'|[@-Z\\-_]'                       # Fe 2-char sequences
            r'|\][^\x07\x1b]*(?:\x07|\x1b\\)'  # OSC  (terminal hyperlinks)
            r'|[PX^_][^\x1b]*\x1b\\'           # DCS, SOS, PM, APC
            r')'
        )
        # Match all Expo / ngrok tunnel URL formats seen in SDK 50–54
        URL_PAT = re.compile(
            r'exp\+?://[^\s\x1b\x07\]\'"\\)><,]+'          # exp:// or exp+slug://
            r'|https?://[a-zA-Z0-9_\-]+\.exp\.direct[^\s\x1b\x07]*'  # *.exp.direct
            r'|https?://u\.expo\.dev[^\s\x1b\x07]*'         # u.expo.dev (new format)
        )
        # Strip non-printable control chars that survive ANSI removal
        CTRL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')

        _ngrok_fetched = [False]  # mutable flag for closure

        def _fetch_ngrok_url():
            """Query ngrok's local REST API for the Expo tunnel URL.
            Expo's @expo/ngrok exposes http://localhost:4040/api/tunnels.
            Retries for up to 15 s in case ngrok hasn't started yet.
            """
            import urllib.request, json as _json, time as _time
            for _ in range(15):
                try:
                    with urllib.request.urlopen(
                        'http://localhost:4040/api/tunnels', timeout=2
                    ) as r:
                        data = _json.loads(r.read())
                        for t in data.get('tunnels', []):
                            pub = t.get('public_url', '')
                            # Pick the HTTPS tunnel to .exp.direct
                            if pub.startswith('https://') and 'exp.direct' in pub:
                                # Expo Go requires exp:// scheme
                                url = pub.replace('https://', 'exp://', 1)
                                _ngrok_fetched[0] = True
                                self.root.after(0, self._update_qr, url)
                                return
                except Exception:
                    pass
                _time.sleep(1)

        def _process_subline(raw: str):
            """Handle one logical line (after \\n / \\r split)."""
            raw = raw.strip()
            if not raw:
                return
            clean = CTRL.sub('', ANSI_ESC.sub('', raw))
            if not clean:
                return
            # Primary: regex match in stdout (works for older Expo / plain-text mode)
            m = URL_PAT.search(clean)
            if m:
                url = m.group(0).rstrip('/.,;:\x07')
                _ngrok_fetched[0] = True
                self.root.after(0, self._update_qr, url)
            # Secondary: when "Tunnel ready." appears, fall back to ngrok REST API
            if 'Tunnel ready' in clean and not _ngrok_fetched[0]:
                threading.Thread(target=_fetch_ngrok_url, daemon=True).start()
            level = ("error"   if "Error" in clean or "error" in clean
                     else "success" if "Tunnel ready" in clean or "connected" in clean.lower()
                     else "warn"    if "warn" in clean.lower() or "deprecated" in clean.lower()
                     else "info")
            self.root.after(0, self._log, f"[expo] {clean}", level)

        for line in proc.stdout:
            # Split on \r so CR-only line updates are each processed separately
            for subline in line.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
                _process_subline(subline)

    def _stop_all(self):
        for name, p in list(self.procs.items()):
            try: p.terminate(); self._log(f"Stopped {name}.", "warn")
            except Exception: pass
        self.procs.clear()
        self._progress["value"] = 0
        # Kill orphaned ngrok so next Start gets a clean tunnel session
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
        self.root.after(0, self._tlog, "Triggering retrain...")
        try:
            d      = self._api_post("/api/retrain")
            status = d.get("status", "unknown")
            if status == "skipped":
                reason = d.get("reason", "Not enough data")
                avail  = d.get("entries_available", "?")
                msg    = f"Skipped — {reason}"
                hint   = f"  Tip: click 'Seed Data Only' first (need ≥ 10 entries, have {avail})."
                self.root.after(0, self._tlog, msg)
                self.root.after(0, self._log,  msg, "warn")
                self.root.after(0, self._log,  hint, "info")
            else:
                f1n = d.get("new_f1_weighted", 0)
                f1o = d.get("old_f1_weighted", 0)
                saved = "saved" if d.get("improved", True) else "not saved (no improvement)"
                msg = f"Retrain {saved}  —  F1 {f1o:.3f} → {f1n:.3f}"
                self.root.after(0, self._tlog, msg)
                self.root.after(0, self._log,  msg, "success")
        except Exception as e:
            self.root.after(0, self._tlog, f"Error: {e}")
            self.root.after(0, self._log,  f"Retrain failed: {e}", "error")

    def _seed_data(self):
        threading.Thread(target=self._do_seed, daemon=True).start()

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

    def _seed_and_train(self):
        def _run():
            self._do_seed(200); time.sleep(5); self._do_retrain()
        threading.Thread(target=_run, daemon=True).start()

    def _pretrain_for_demo(self):
        def _run():
            CYCLES = 15
            ENTRIES_PER_CYCLE = 200
            self.root.after(0, self._pretrain_lbl.config,
                            {"text": "Running...", "fg": YLW})
            self.root.after(0, self._log,
                "Pre-training started: 15 cycles x 200 entries. Backend must be running.", "warn")
            if not self._is_backend_alive():
                self.root.after(0, self._log,
                    "Backend not running! Press Start ScreenSense first.", "error")
                self.root.after(0, self._pretrain_lbl.config,
                                {"text": "Backend offline.", "fg": RED})
                return
            for i in range(1, CYCLES + 1):
                self.root.after(0, self._pretrain_lbl.config,
                                {"text": f"Cycle {i}/{CYCLES}...", "fg": YLW})
                self.root.after(0, self._log, f"[pre-train] Cycle {i}/{CYCLES}  - seeding {ENTRIES_PER_CYCLE} entries...", "info")
                self._do_seed(ENTRIES_PER_CYCLE)
                time.sleep(3)
                self.root.after(0, self._log, f"[pre-train] Cycle {i}/{CYCLES}  - retraining...", "info")
                self._do_retrain()
                time.sleep(2)
            self.root.after(0, self._pretrain_lbl.config,
                            {"text": "Done! Model pre-trained.", "fg": GRN})
            self.root.after(0, self._log,
                f"Pre-training complete. {CYCLES} cycles, {CYCLES*ENTRIES_PER_CYCLE} entries total.", "success")
            self.root.after(0, self._log,
                "Switch to Overview to see the F1 learning curve.", "success")
        threading.Thread(target=_run, daemon=True).start()

    def _run_n_cycles(self):
        n = self._cycle_var.get()
        def _run():
            for i in range(n):
                self.root.after(0, self._tlog, f"Cycle {i+1}/{n} - seeding...")
                self.root.after(0, self._log,  f"Cycle {i+1}/{n} - seeding", "info")
                self._do_seed();    time.sleep(5)
                self.root.after(0, self._tlog, f"Cycle {i+1}/{n} - retraining...")
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

    def _open_url(self, url):
        import webbrowser; webbrowser.open(url, new=2)

    def run(self):
        self._log("ScreenSense Control Panel ready.")
        self._log("Press 'Start ScreenSense' on the left to launch all services.")
        self._log("New here? Check the 'Guide' tab for step-by-step instructions.", "warn")
        self.root.mainloop()


# ── Entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = ControlPanel()
    app.run()
