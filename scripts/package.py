"""Empacota somente os arquivos de entrega; não inclui credenciais ou dependências locais."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
output = root / "outputs" / "Inventario-TI-fonte.zip"
output.parent.mkdir(exist_ok=True)
public_files = ["index.html", "styles.css", "app.js", "api.js", "scanner.js", "config.js", "package.json", "README.md", ".gitignore"]
folders = [".github", "apps-script", "vendor", "docs", "scripts", "tests", "planilha"]
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for filename in public_files:
        archive.write(root / filename, filename)
    for folder in folders:
        for filename in sorted((root / folder).rglob("*")):
            if filename.is_file() and "__pycache__" not in filename.parts:
                archive.write(filename, filename.relative_to(root).as_posix())
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert ".github/workflows/pages.yml" in archive.namelist()
    assert "apps-script/JwtLibrary.gs" in archive.namelist()
print(output)
