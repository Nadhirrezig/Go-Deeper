#!/bin/sh
# The studio's own certificate authority, created once in the `ca` volume (mounted at /ca):
#
#   root.crt                    what each Windows PC installs ("Autorités de certification racines")
#   intermediate.crt / .key     what Caddy signs studio.vipgroup.lan's certificate with
#   public/                     the download page, served at http://<studio>/certificat
#
# Both authority certificates carry a name constraint: they can only vouch for $STUDIO_HOST, never
# for another site. The root's private key is deleted as soon as the intermediate is signed, so it
# exists nowhere. Run again: nothing changes, except the download page, which is written again.
set -eu

HOST="${STUDIO_HOST:-studio.vipgroup.lan}"
DIR=/ca
mkdir -p "$DIR/public"
cd "$DIR"

if [ ! -f intermediate.key ]; then
  echo "Creating the certificate authority for $HOST"
  umask 077
  openssl req -x509 -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
    -keyout root.key -out root.crt -days 3650 \
    -subj "/O=VipGroup/CN=VipGroup Studio CA ($HOST)" \
    -addext "basicConstraints=critical,CA:true,pathlen:1" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "nameConstraints=critical,permitted;DNS:$HOST"
  openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
    -keyout intermediate.key -out intermediate.csr \
    -subj "/O=VipGroup/CN=VipGroup Studio Intermediate ($HOST)"
  cat > intermediate.ext <<EOF
basicConstraints = critical, CA:true, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
nameConstraints = critical, permitted;DNS:$HOST
EOF
  openssl x509 -req -in intermediate.csr -CA root.crt -CAkey root.key -CAcreateserial \
    -days 3650 -extfile intermediate.ext -out intermediate.crt
  rm -f root.key root.srl intermediate.csr intermediate.ext
  umask 022
  chmod 644 root.crt intermediate.crt
fi

# --- Download page (French, for the team) -----------------------------------------------------
openssl x509 -in root.crt -outform der -out public/vipgroup-studio-ca.cer
FINGERPRINT="$(openssl x509 -in root.crt -noout -fingerprint -sha256 | cut -d= -f2)"
# Windows' install prompt shows the SHA-1 thumbprint, in groups of 8: show it the same way.
THUMBPRINT="$(openssl x509 -in root.crt -noout -fingerprint -sha1 | cut -d= -f2 | tr -d : | sed 's/.\{8\}/& /g; s/ $//')"
EXPIRES="$(openssl x509 -in root.crt -noout -enddate | cut -d= -f2)"

# Windows installer: installs the certificate machine-wide and maps the studio hostname in hosts.
# CRLF line endings for cmd.
{
  printf '%s\r\n' \
    '@echo off' \
    'setlocal' \
    'REM === A MODIFIER : IP fixe du serveur ===' \
    'set "SERVER_IP=192.168.1.17"' \
    "set \"DOMAIN=$HOST\"" \
    'set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"' \
    '' \
    'REM --- Relance en administrateur si necessaire ---' \
    'fltmc >nul 2>&1 || (' \
    '  echo Demande des droits administrateur...' \
    "  powershell -NoProfile -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\"" \
    '  exit /b' \
    ')' \
    '' \
    'echo Installation du certificat du studio VipGroup (%DOMAIN%)' \
    'set "CERT=%TEMP%\vipgroup-studio-ca.cer"' \
    '('
  while IFS= read -r line; do printf 'echo %s\r\n' "$line"; done < root.crt
  printf '%s\r\n' \
    ') > "%CERT%"' \
    'certutil -addstore -f Root "%CERT%" >nul' \
    'if errorlevel 1 (' \
    '  echo.' \
    '  echo Le certificat n a pas ete installe.' \
    '  del "%CERT%"' \
    '  pause' \
    '  exit /b 1' \
    ')' \
    'del "%CERT%"' \
    'echo Certificat installe.' \
    '' \
    'REM --- Fichier hosts : sauvegarde, retire l ancienne ligne, ajoute la nouvelle ---' \
    'if not exist "%HOSTS%.vipgroup.bak" copy /y "%HOSTS%" "%HOSTS%.vipgroup.bak" >nul' \
    'attrib -r "%HOSTS%"' \
    "powershell -NoProfile -Command \"\$ErrorActionPreference='Stop'; try { \$h='%HOSTS%'; \$domain='%DOMAIN%'; \$c=@(Get-Content \$h | Where-Object { \$_ -notmatch ('\\s' + [regex]::Escape(\$domain) + '(\\s|\$)') }); \$c += '%SERVER_IP% %DOMAIN%'; Set-Content -Path \$h -Value \$c -Encoding ASCII; exit 0 } catch { exit 1 }\"" \
    'if errorlevel 1 (' \
    '  echo.' \
    '  echo Le fichier hosts n a pas pu etre modifie.' \
    '  pause' \
    '  exit /b 1' \
    ')' \
    'ipconfig /flushdns >nul' \
    'echo Domaine configure : %DOMAIN% -^> %SERVER_IP%' \
    '' \
    'echo.' \
    'echo Termine. Fermez puis rouvrez le navigateur, puis ouvrez https://%DOMAIN%' \
    'pause'
} > public/installer-certificat.cmd

cat > public/index.html <<EOF
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Certificat du studio VipGroup</title>
<style>
  body { font: 16px/1.55 system-ui, sans-serif; max-width: 42rem; margin: 3rem auto; padding: 0 1rem; color: #18181b; background: #f4f4f5; }
  h1 { font-size: 1.6rem; margin-bottom: .25rem; }
  .card { background: #fff; border-radius: 1rem; padding: 1.25rem 1.5rem; margin: 1.25rem 0; box-shadow: 0 1px 3px rgb(0 0 0 / .08); }
  a.button { display: inline-block; background: #18181b; color: #fff; padding: .65rem 1.1rem; border-radius: .75rem; text-decoration: none; font-weight: 600; }
  a.button:focus-visible, a:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
  code { font-size: .85rem; word-break: break-all; }
  ol li { margin: .35rem 0; }
  .muted { color: #52525b; font-size: .9rem; }
</style>
</head>
<body>
<h1>Certificat du studio VipGroup</h1>
<p class="muted">À faire une fois sur chaque PC Windows, pour ouvrir le studio en HTTPS sans alerte du navigateur.</p>

<div class="card">
  <p><a class="button" href="/certificat/installer-certificat.cmd" download>Télécharger l’installateur</a></p>
  <ol>
    <li>Ouvrez le fichier <strong>installer-certificat.cmd</strong> téléchargé. Si Windows prévient qu’il vient d’Internet, choisissez <strong>Exécuter</strong> (ou <em>Informations complémentaires</em> puis <em>Exécuter quand même</em>).</li>
    <li>Windows demande si vous voulez installer le certificat « VipGroup Studio CA » : répondez <strong>Oui</strong>.</li>
    <li>Fermez puis rouvrez le navigateur (Chrome ou Edge), puis ouvrez <a href="https://$HOST">https://$HOST</a>.</li>
  </ol>
</div>

<div class="card">
  <p><strong>Installation manuelle</strong> : téléchargez <a href="/certificat/vipgroup-studio-ca.cer" download>vipgroup-studio-ca.cer</a>, ouvrez-le, <em>Installer le certificat…</em>, <em>Utilisateur actuel</em>, <em>Placer tous les certificats dans le magasin suivant</em> → <em>Autorités de certification racines de confiance</em>, puis <em>Terminer</em> et <strong>Oui</strong>.</p>
  <p class="muted">Ce certificat ne peut garantir qu’un seul site : <strong>$HOST</strong>. Il ne permet d’intercepter aucun autre site.</p>
  <p class="muted">Empreinte numérique (sha1), à comparer avec celle que Windows affiche avant « Oui » :<br><code>$THUMBPRINT</code><br>SHA-256 : <code>$FINGERPRINT</code><br>Valable jusqu’au : $EXPIRES</p>
</div>
</body>
</html>
EOF
echo "Download page ready for $HOST"
