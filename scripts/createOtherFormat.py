from __future__ import annotations

import concurrent.futures
import multiprocessing
import json
import shutil
import subprocess
from pathlib import Path


# Configuration

OUTPUT_EXTENSION = ".opus"

# Qualité maximale raisonnable pour Opus
OPUS_BITRATE = "320k"

# Nombre de conversions simultanées
MAX_WORKERS = max(1, multiprocessing.cpu_count())

# Dossiers à traiter
TARGET_ALBUMS = [
    "Album 5",
    "Album 6",
    "Album 7",
]


# Chemins

SCRIPT_DIR = Path(__file__).resolve().parent
ASSETS_DIR = (SCRIPT_DIR / "../assets").resolve()


# Fonctions


def check_tools():
    """
    Vérifie que ffmpeg et ffprobe existent.
    """

    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg introuvable")

    if shutil.which("ffprobe") is None:
        raise RuntimeError("ffprobe introuvable")


def is_target_folder(file: Path) -> bool:
    """
    Vérifie si le fichier appartient aux albums ciblés.
    """

    path = str(file)

    return any(
        album in path
        for album in TARGET_ALBUMS
    )


def extract_metadata(file: Path) -> dict:
    """
    Récupère les métadonnées en UTF-8.
    """

    command = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        str(file),
    ]

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    if result.returncode != 0:
        return {}

    data = json.loads(result.stdout)

    return data.get("format", {}).get("tags", {})


def output_file(file: Path) -> Path:
    """
    Définit le nom du fichier de sortie.
    """

    return file.with_suffix(OUTPUT_EXTENSION)


def build_ffmpeg_command(
    input_file: Path,
    output_file: Path,
    metadata: dict
) -> list[str]:
    """
    Crée la commande ffmpeg.
    """

    command = [
        "ffmpeg",
        "-y",

        "-i",
        str(input_file),

        "-vn",

        "-c:a",
        "libopus",

        "-b:a",
        OPUS_BITRATE,

        "-map_metadata",
        "-1",
    ]


    # Ajout de toutes les métadonnées
    for key, value in metadata.items():

        if value:
            command.extend(
                [
                    "-metadata",
                    f"{key}={value}"
                ]
            )


    command.append(
        str(output_file)
    )

    return command


def convert_file(file: Path):
    """
    Convertit un fichier m4a.
    """

    try:

        destination = output_file(file)


        if destination.exists():
            print(f"[SKIP] {destination.name}")
            return


        metadata = extract_metadata(file)


        command = build_ffmpeg_command(
            file,
            destination,
            metadata
        )


        result = subprocess.run(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )


        if result.returncode == 0:

            print(
                f"[OK] {destination}"
            )

        else:

            print(
                f"[ERREUR] {file}"
            )

            print(
                result.stderr
            )


    except Exception as error:

        print(
            f"[ERREUR] {file} : {error}"
        )


def find_files() -> list[Path]:
    """
    Trouve les fichiers m4a concernés.
    """

    files = []


    for file in ASSETS_DIR.rglob("*.m4a"):

        if is_target_folder(file):

            files.append(file)


    return files



def main():

    check_tools()


    files = find_files()


    print(
        f"{len(files)} fichiers trouvés"
    )

    print(
        f"Threads : {MAX_WORKERS}"
    )


    with concurrent.futures.ThreadPoolExecutor(
        max_workers=MAX_WORKERS
    ) as executor:

        executor.map(
            convert_file,
            files
        )


    print(
        "Conversion terminée."
    )


if __name__ == "__main__":
    main()
