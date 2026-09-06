// Benchmark MIPS simple pour l'ESP32.
// La mesure correspond au débit d'une séquence connue de NOP sur un seul cœur.
// Ce n'est pas un score Dhrystone/CoreMark ; il sert d'indicateur de performance
// cohérent et reproductible pour le tableau de bord.

float cpuMips = 0.0f;

float measureCpuMips()
{
    const uint32_t iterations = 10000;
    const uint32_t instructionsPerIteration = 64;

    const uint32_t startUs = micros();

    for (uint32_t i = 0; i < iterations; ++i)
    {
        asm volatile(
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
            "nop\n\t" "nop\n\t" "nop\n\t" "nop\n\t"
        );
    }

    const uint32_t elapsedUs = micros() - startUs;
    if (elapsedUs == 0)
        return 0.0f;

    const float executedInstructions =
        static_cast<float>(iterations) * instructionsPerIteration;

    // 1 instruction / microseconde = 1 MIPS.
    return executedInstructions / static_cast<float>(elapsedUs);
}
