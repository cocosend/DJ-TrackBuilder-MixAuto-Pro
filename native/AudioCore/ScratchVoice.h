#ifndef TB_SCRATCH_VOICE_H
#define TB_SCRATCH_VOICE_H
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct TBScratchVoice TBScratchVoice;
TBScratchVoice *tb_scratch_create(double output_rate);
void tb_scratch_destroy(TBScratchVoice *voice);
// Control thread only; returns 0 if PCM is invalid. Copies into immutable storage.
int tb_scratch_load(TBScratchVoice *voice, const float *left, const float *right,
                    size_t frames, double start_seconds);
void tb_scratch_target(TBScratchVoice *voice, double absolute_seconds);
void tb_scratch_active(TBScratchVoice *voice, int active);
double tb_scratch_position(const TBScratchVoice *voice);
void tb_scratch_reap(TBScratchVoice *voice);
void tb_scratch_render(TBScratchVoice *voice, float *left, float *right, size_t frames);
#ifdef __cplusplus
}
#endif
#endif
