// Adobe XMP DynamicMedia sidecar generator for Premiere Pro / After Effects.
// Saved as `<video>.xmp` next to the video file → Premiere auto-detects.

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function buildXmpMarkers(captures, fps) {
  const fpsStr = (Number(fps) || 30).toFixed(6);
  const sorted = [...captures].sort((a, b) => a.time - b.time);
  const markerXml = sorted
    .map((c, i) => {
      const frame = Math.max(0, Math.round(Number(c.time) * Number(fps)));
      const name = escapeXml(c.name || `Capture ${i + 1}`);
      return `                        <rdf:li rdf:parseType="Resource">
                           <xmpDM:startTime>${frame}</xmpDM:startTime>
                           <xmpDM:duration>0</xmpDM:duration>
                           <xmpDM:name>${name}</xmpDM:name>
                           <xmpDM:type>Chapter</xmpDM:type>
                        </rdf:li>`;
    })
    .join('\n');

  // eslint-disable-next-line no-irregular-whitespace -- begin="" 안의 U+FEFF(BOM)는 XMP 스펙 필수 마커
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="싹싹김치 플레이어">
   <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description rdf:about=""
            xmlns:xmpDM="http://ns.adobe.com/xmp/1.0/DynamicMedia/">
         <xmpDM:Tracks>
            <rdf:Bag>
               <rdf:li rdf:parseType="Resource">
                  <xmpDM:trackName>싹싹김치 마커</xmpDM:trackName>
                  <xmpDM:trackType>Cue</xmpDM:trackType>
                  <xmpDM:frameRate>f${fpsStr}</xmpDM:frameRate>
                  <xmpDM:markers>
                     <rdf:Seq>
${markerXml}
                     </rdf:Seq>
                  </xmpDM:markers>
               </rdf:li>
            </rdf:Bag>
         </xmpDM:Tracks>
      </rdf:Description>
   </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
`;
}

module.exports = { buildXmpMarkers };
