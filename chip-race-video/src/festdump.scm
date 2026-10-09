;; Synthesize env LINE with the HTS voice; write OUT.wav and OUT.txt
;; OUT.txt rows: phone end_time word syl_pos_in_word
(voice_cmu_us_slt_arctic_hts)
(set! utt (SynthText LINE_TEXT))
(utt.save.wave utt (string-append OUT_PATH ".wav") 'riff)
(set! fd (fopen (string-append OUT_PATH ".txt") "w"))
(mapcar
 (lambda (s)
   (format fd "%s %f %s %s\n" (item.name s) (item.feat s "end")
           (item.feat s "R:SylStructure.parent.parent.name")
           (item.feat s "R:SylStructure.parent.pos_in_word")))
 (utt.relation.items utt 'Segment))
(fclose fd)
