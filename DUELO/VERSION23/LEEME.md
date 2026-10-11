# Buscador para iPhone (web app)

En iPhone no se puede instalar un APK ni un IPA sin Mac y cuenta de desarrollador de Apple.
La alternativa es esta web app: se abre en Safari y se añade a la pantalla de inicio, donde
se comporta como una app (icono, pantalla completa, sin barra del navegador).

## Publicar (una sola vez)
Sube estos archivos a tu GitHub Pages, por ejemplo a una carpeta nueva `buscador` junto al listado:
  index.html, logica.js, manifest.webmanifest, icon-180.png, icon-192.png, icon-512.png
Quedará en una dirección tipo https://carre2024.github.io/DUELO/VERSION23/buscador/
(el listado y el logo se siguen leyendo de https://carre2024.github.io/DUELO/VERSION23/).

## Instalar en el iPhone
1. Abre esa dirección en **Safari**.
2. Botón Compartir ▸ **Añadir a pantalla de inicio**.
3. Abre el icono "Buscador". La primera vez Safari pide permiso para el micrófono y el dictado.

## Uso
Igual que en Android: pulsa el botón, habla y vuelve a pulsar. Necesita internet (descarga el listado
al abrir y al pulsar la fecha). Los cambios en stocktotal.js o logo.svg se ven sin reinstalar nada.
Para cambiar la lógica de búsqueda, se sustituye logica.js en GitHub.

## Si la voz no funciona
- Ajustes ▸ General ▸ Teclado ▸ activa "Activar dictado".
- Ajustes ▸ Safari ▸ Micrófono: permitir.
- Si en la app de la pantalla de inicio no reconoce la voz pero en Safari sí, usa Safari con la misma dirección.
- Si el móvil no ofrece reconocimiento de voz, aparece una caja de texto para escribir la búsqueda.
