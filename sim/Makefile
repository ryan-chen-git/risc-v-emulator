CXX      := g++
CXXFLAGS := -std=c++17 -O2 -Wall -Wextra -MMD -MP

SIM_SRC := main.cpp circ.cpp xml.cpp net.cpp
RUN_SRC := run.cpp engine.cpp blocks.cpp
SIM_OBJ := $(SIM_SRC:%.cpp=build/%.o)
RUN_OBJ := $(RUN_SRC:%.cpp=build/%.o)
DEP     := $(SIM_OBJ:.o=.d) $(RUN_OBJ:.o=.d)

all: build/sim build/run

build/sim: $(SIM_OBJ)
	$(CXX) $(CXXFLAGS) -o $@ $^

build/run: $(RUN_OBJ)
	$(CXX) $(CXXFLAGS) -o $@ $^

build/%.o: %.cpp | build
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build:
	mkdir -p build

clean:
	rm -rf build

.PHONY: all clean
-include $(DEP)
