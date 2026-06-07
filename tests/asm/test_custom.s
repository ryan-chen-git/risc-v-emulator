lui x1, 0x10000
addi x2, x0, 0x12
addi x3, x0, 0x345
lui x4, 0x1
addi x4, x4, 0x789
addi x5, x0, -5
sb x2, 0(x1)
sb x3, 1(x1)
sb x4, 2(x1)
sb x5, 3(x1)
sh x3, 4(x1)
sh x4, 6(x1)
sw x4, 8(x1)
sw x5, 12(x1)
lb x6, 0(x1)
lb x7, 1(x1)
lb x8, 2(x1)
lb x9, 3(x1)
lh x10, 4(x1)
lh x11, 6(x1)
lw x12, 8(x1)
lw x13, 12(x1)
addi x0, x0, 0