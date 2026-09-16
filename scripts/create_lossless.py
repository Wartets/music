import os
import shutil
import subprocess
import threading
import tkinter as tk
from tkinter import filedialog, messagebox
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from queue import Queue
from PIL import Image, ImageEnhance, ImageFilter

DEFAULT_SOURCE = Path(
    r"D:\Documents\Github\music\assets\Album 7 (2026)\Album 7.1"
)

AUDIO_EXTENSIONS = {
    ".mp3",
    ".flac",
    ".m4a",
    ".mp4",
    ".aac",
    ".ogg",
    ".oga",
    ".wma",
    ".aiff",
    ".aif",
    ".wav",
}

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
    ".tiff",
    ".tif",
}

IGNORED_EXTENSIONS = {
    ".opus",
    ".gif",
    ".svg",
}

MAX_WORKERS = min(8, (os.cpu_count() or 4) * 2)

class CopyConverterApp:

    def __init__(self, root):
        self.root = root
        self.root.title("Copie + conversion audio")
        self.root.geometry("620x330")
        self.root.resizable(False, False)

        self.queue = Queue()
        self.running = False

        self.total_files = 0
        self.completed_files = 0

        tk.Label(
            root,
            text="Dossier source :",
            font=("Segoe UI", 10, "bold")
        ).pack(anchor="w", padx=20, pady=(15, 5))

        source_frame = tk.Frame(root)
        source_frame.pack(fill="x", padx=20)

        self.source_var = tk.StringVar(
            value=str(DEFAULT_SOURCE) if DEFAULT_SOURCE.exists() else ""
        )

        tk.Entry(
            source_frame,
            textvariable=self.source_var,
            state="readonly"
        ).pack(side="left", fill="x", expand=True)

        tk.Button(
            source_frame,
            text="Choisir...",
            command=self.choose_source
        ).pack(side="left", padx=(8, 0))

        tk.Label(
            root,
            text="Dossier de destination :",
            font=("Segoe UI", 10, "bold")
        ).pack(anchor="w", padx=20, pady=(15, 5))

        destination_frame = tk.Frame(root)
        destination_frame.pack(fill="x", padx=20)

        self.destination_var = tk.StringVar()

        tk.Entry(
            destination_frame,
            textvariable=self.destination_var,
            state="readonly"
        ).pack(side="left", fill="x", expand=True)

        tk.Button(
            destination_frame,
            text="Choisir...",
            command=self.choose_destination
        ).pack(side="left", padx=(8, 0))

        self.process_images_var = tk.BooleanVar(value=False)
        tk.Checkbutton(
            root,
            text="Copier et agrandir les images carrées (min 1400x1400, amélioration de netteté)",
            variable=self.process_images_var
        ).pack(anchor="w", padx=20, pady=(10, 0))

        self.progress_var = tk.DoubleVar(value=0)

        self.progress = tk.Scale(
            root,
            variable=self.progress_var,
            from_=0,
            to=100,
            orient="horizontal",
            showvalue=False,
            state="disabled",
            length=580
        )
        self.progress.pack(padx=20, pady=(20, 0))

        self.status_var = tk.StringVar(value="Choisis le dossier de destination.")

        tk.Label(
            root,
            textvariable=self.status_var
        ).pack(pady=(5, 10))

        self.start_button = tk.Button(
            root,
            text="Lancer",
            command=self.start
        )
        self.start_button.pack()

        self.root.after(100, self.process_queue)

    def choose_source(self):
        source = filedialog.askdirectory(
            title="Choisir le dossier source"
        )

        if source:
            self.source_var.set(source)

    def choose_destination(self):
        destination = filedialog.askdirectory(
            title="Choisir le dossier de destination"
        )

        if destination:
            self.destination_var.set(destination)

    def get_files(self, source_dir, process_images):
        files = []

        for root, dirs, filenames in os.walk(source_dir):
            for filename in filenames:
                path = Path(root) / filename

                extension = path.suffix.lower()

                if extension in IGNORED_EXTENSIONS:
                    continue

                if extension in IMAGE_EXTENSIONS:
                    if process_images:
                        files.append(("image", path))
                    continue

                if extension in AUDIO_EXTENSIONS:
                    files.append(("audio", path))
                    continue

                files.append(("copy", path))

        return files

    def process_file(self, file_type, source_file, source_dir, destination):
        relative_path = source_file.relative_to(source_dir)

        if file_type == "audio":
            output_file = destination / relative_path.with_suffix(".wav")

            output_file.parent.mkdir(
                parents=True,
                exist_ok=True
            )

            # PCM 16-bit = WAV lossless
            command = [
                "ffmpeg",
                "-y",
                "-i",
                str(source_file),
                "-vn",
                "-c:a",
                "pcm_s16le",
                str(output_file),
            ]

            result = subprocess.run(
                command,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW
                if os.name == "nt"
                else 0,
            )

            if result.returncode != 0:
                error = result.stderr.decode(
                    errors="replace"
                )

                raise RuntimeError(
                    f"Erreur FFmpeg pour {source_file.name}:\n{error}"
                )

        elif file_type == "image":
            with Image.open(source_file) as img:
                width, height = img.size

                if width != height:
                    return

                target_size = max(width, 1400)
                processed_img = img

                if processed_img.mode not in ("RGB", "RGBA"):
                    processed_img = processed_img.convert("RGB")

                current_size = width
                if current_size < target_size:
                    while current_size < target_size:
                        next_size = min(int(current_size * 1.35), target_size)
                        if target_size - next_size < 120:
                            next_size = target_size

                        processed_img = processed_img.resize(
                            (next_size, next_size),
                            resample=Image.Resampling.LANCZOS
                        )

                        processed_img = processed_img.filter(
                            ImageFilter.UnsharpMask(radius=1.2, percent=85, threshold=2)
                        )

                        current_size = next_size

                    sharpener = ImageEnhance.Sharpness(processed_img)
                    processed_img = sharpener.enhance(1.15)

                output_file = destination / relative_path
                output_file.parent.mkdir(
                    parents=True,
                    exist_ok=True
                )

                fmt = img.format or "JPEG"
                if fmt.upper() in ["JPEG", "JPG"]:
                    if processed_img.mode in ("RGBA", "P"):
                        processed_img = processed_img.convert("RGB")
                    processed_img.save(output_file, format="JPEG", quality=96, subsampling=0)
                else:
                    processed_img.save(output_file, format=fmt)

        else:
            output_file = destination / relative_path

            output_file.parent.mkdir(
                parents=True,
                exist_ok=True
            )

            shutil.copy2(
                source_file,
                output_file
            )

    def worker(self, file_type, source_file, source_dir, destination):
        try:
            self.process_file(
                file_type,
                source_file,
                source_dir,
                destination
            )

            self.queue.put(
                ("done", source_file.name)
            )

        except Exception as error:
            self.queue.put(
                ("error", str(error))
            )

    def start(self):
        if self.running:
            return

        source = self.source_var.get().strip()
        destination = self.destination_var.get().strip()

        if not source:
            messagebox.showwarning(
                "Source manquante",
                "Choisis d'abord le dossier source."
            )
            return

        source_dir = Path(source)
        if not source_dir.exists() or not source_dir.is_dir():
            messagebox.showerror(
                "Erreur",
                f"Le dossier source n'existe pas :\n\n{source_dir}"
            )
            return

        if not destination:
            messagebox.showwarning(
                "Destination manquante",
                "Choisis d'abord le dossier de destination."
            )
            return

        dest_dir = Path(destination)

        if dest_dir.resolve() == source_dir.resolve():
            messagebox.showerror(
                "Erreur",
                "La destination ne peut pas être le dossier source."
            )
            return

        self.running = True
        self.start_button.config(state="disabled")

        self.status_var.set("Analyse des fichiers...")

        process_images = self.process_images_var.get()

        thread = threading.Thread(
            target=self.run_copy,
            args=(source_dir, dest_dir, process_images),
            daemon=True
        )

        thread.start()

    def run_copy(self, source_dir, destination, process_images):
        files = self.get_files(source_dir, process_images)

        self.total_files = len(files)
        self.completed_files = 0

        if self.total_files == 0:
            self.queue.put(("finished", None))
            return

        self.queue.put(
            ("progress", "Démarrage...")
        )

        with ThreadPoolExecutor(
            max_workers=MAX_WORKERS
        ) as executor:

            futures = [
                executor.submit(
                    self.worker,
                    file_type,
                    source_file,
                    source_dir,
                    destination
                )
                for file_type, source_file in files
            ]

            for future in as_completed(futures):
                future.result()

        self.queue.put(
            ("finished", None)
        )

    def process_queue(self):
        try:
            while True:
                message_type, data = self.queue.get_nowait()

                if message_type == "done":
                    self.completed_files += 1

                    percentage = (
                        self.completed_files
                        / self.total_files
                    ) * 100

                    self.progress_var.set(
                        percentage
                    )

                    self.status_var.set(
                        f"{self.completed_files} / "
                        f"{self.total_files} fichiers "
                        f"({percentage:.1f} %) — {data}"
                    )

                elif message_type == "error":
                    self.completed_files += 1

                    percentage = (
                        self.completed_files
                        / self.total_files
                    ) * 100

                    self.progress_var.set(
                        percentage
                    )

                    self.status_var.set(
                        f"Erreur — {data}"
                    )

                elif message_type == "progress":
                    self.status_var.set(data)

                elif message_type == "finished":
                    self.progress_var.set(100)
                    self.running = False
                    self.start_button.config(
                        state="normal"
                    )

                    self.status_var.set(
                        "Terminé."
                    )

                    messagebox.showinfo(
                        "Terminé",
                        "La copie et la conversion sont terminées."
                    )

        except Exception:
            pass

        self.root.after(
            100,
            self.process_queue
        )

if __name__ == "__main__":
    root = tk.Tk()

    app = CopyConverterApp(root)

    root.mainloop()
